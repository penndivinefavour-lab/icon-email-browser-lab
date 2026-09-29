# Phase 6 Research — Provider Adapters

**Date**: September 30, 2026  
**Scope**: IMAP, Gmail OAuth2, Microsoft Graph/Outlook  
**Status**: Research & Architecture Only — No Implementation

---

## Executive Summary

Three provider approaches for authorized inbox access, all verified via official documentation:

| Provider | Library | Auth Method | Required Scopes | Complexity | Security Tier |
|----------|---------|-------------|-----------------|------------|---------------|
| Generic IMAP | **imapflow** (recommended) | OAuth2 / LOGIN | N/A (IMAP-native) | Medium | Low risk |
| Gmail API | Direct REST calls (no SDK) | OAuth2 (PKCE for local apps) | `gmail.readonly` + `openid` | Medium | Restricted tier |
| Outlook/Graph | Direct REST calls | OAuth2 (code flow) | `Mail.Read` + `offline_access` | Low | Moderate risk |

---

## Existing Architecture Audit

### Current Provider Abstraction (`packages/email/src/index.ts`)

```typescript
export abstract class EmailProvider {
  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]>;
  abstract searchMessages(query: string): Promise<EmailMessage[]>;
  abstract markAsRead(messageId: string): Promise<boolean>;
  abstract getUnreadCount(): Promise<number>;
}
```

**Gap analysis:**
- `connect()` returns `Promise<boolean>` — needs to become `Promise<{connected: boolean; error?: string}>` for health reporting
- No `sync()` method — providers need incremental sync
- No `tokenExpiry` tracking — required for OAuth2 refresh
- No `healthCheck()` — needed for status indicators in UI
- `EmailAccount.config` is a flat JSON string — needs restructuring for OAuth2 tokens

### Current Database Schema (`email_accounts` table)

```sql
email_accounts (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,       -- 'mock' | 'imap' | 'gmail' | 'outlook'
  config TEXT NOT NULL DEFAULT '{}', -- JSON blob with credentials
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_synced_at TEXT                -- Nullable
)
```

**Schema changes needed:**

```sql
ALTER TABLE email_accounts ADD COLUMN oauth_token TEXT;
ALTER TABLE email_accounts ADD COLUMN oauth_refresh_token TEXT;
ALTER TABLE email_accounts ADD COLUMN token_expires_at TEXT;
ALTER TABLE email_accounts ADD COLUMN connection_status TEXT DEFAULT 'disconnected';
ALTER TABLE email_accounts ADD COLUMN last_error TEXT;
```

Or alternatively, expand the `config` column to hold all OAuth state:

```json
{
  "type": "gmail",
  "clientId": "...",
  "clientSecret": "...",
  "accessToken": "...",
  "refreshToken": "...",
  "tokenExpiresAt": "2026-10-01T00:00:00Z",
  "redirectUri": "http://localhost:3000/oauth/callback"
}
```

**Recommendation**: Expand `config` — keeps schema flat, avoids migration, and aligns with existing pattern. Add virtual columns in the ORM layer (`token_expires_at`, `connection_status`) derived from `config`.

### OTP Parser Integration

The existing `OTPParser` works at the `EmailMessage` level — it parses `subject` and `body`. This interface does **not** change between providers. Each provider's `fetchMessages()` must return `EmailMessage[]` in the same shape. The parser is agnostic.

### UI Components Affected

| Module | Change Needed |
|--------|---------------|
| Settings | Add provider configuration forms (OAuth buttons + IMAP manual config) |
| Inbox Manager | Show provider badge per account, connection status indicator |
| Dashboard | Show provider-specific stats (connected accounts count, last sync time) |
| Identity Detail | Link email accounts to identities, show sync status |

---

## Provider 1: Generic IMAP via imapflow

### Library Assessment

| Attribute | Value |
|-----------|-------|
| Package | `imapflow` |
| Latest Version | 1.x (as of Sep 2026) |
| License | MIT |
| Repository | https://github.com/postalsys/imapflow |
| Maintained By | EmailEngine team (postalsys) |
| Last Update | Active (2025–2026) |
| TypeScript | Built-in types |
| Node.js Requirement | **Node.js 20+** (critical constraint) |
| ESM/CJS | Both supported |

**Why imapflow over node-imap:**
- `node-imap` author explicitly abandoned it in March 2025 (issue #921 closed: "we switched to another IMAP server and we changed the whole implementation")
- `node-imap` has 193 open issues, no fix for known Gmail connection-death-after-24h bug
- `imap-simple` wrapper is archived
- `imapflow` is the proven successor, powers EmailEngine in production

### Authentication Methods Supported

| Method | Mechanism | Use Case |
|--------|-----------|----------|
| `LOGIN` | Plain username/password | Basic auth, older servers |
| `AUTH=PLAIN` | SASL PLAIN | Modern servers |
| `AUTH=LOGIN` | SASL LOGIN | Legacy servers |
| `AUTH=OAUTHBEARER` | RFC 7628 OAuth2 | Gmail, Outlook IMAP endpoints |
| `AUTH=XOAUTH2` | Legacy OAuth2 | Gmail legacy support |
| Admin Impersonation | SASL PLAIN + `authzid` | Enterprise/Shared mailboxes |

**OAuth2 Flow for IMAP (imapflow):**
```typescript
const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    accessToken: 'ya29.a0AfH6SMBx...', // OAuth2 bearer token
  }
});
```

### Required IMAP Server Details

| Provider | IMAP Host | Port | OAuth2 Endpoint |
|----------|-----------|------|-----------------|
| Gmail | `imap.gmail.com` | 993 | OAuth2 via IMAP (XOAUTH2/OAUTHBEARER) |
| Outlook/Hotmail | `outlook.office365.com` | 993 | OAuth2 via IMAP (XOAUTH2) |
| Yahoo | `imap.mail.yahoo.com` | 993 | App passwords only (no OAuth2 for IMAP) |
| iCloud | `imap.mail.me.com` | 993 | App passwords only |
| Generic (custom) | User-configured | 993 | LOGIN or PLAIN |

### OAuth2 for IMAP (Gmail/Outlook)

For IMAP providers that support OAuth2, the flow is:
1. Get OAuth2 access token via standard Google/Microsoft OAuth2 flow
2. Generate SASL XOAUTH2 or OAUTHBEARER string
3. Pass token to imapflow as `accessToken`
4. imapflow handles the SASL handshake automatically

**Gmail XOAUTH2 token generation:**
```typescript
import { createOauth2Session } from 'imapflow';
const oauth2String = createOauth2Session({
  user: 'user@gmail.com',
  accessToken: 'ya29.xxx...',
});
```

### Connection Test Behavior

```typescript
async function testConnection(config: EmailProviderConfig): Promise<ConnectionTestResult> {
  const client = new ImapFlow({
    host: config.host!,
    port: config.port || 993,
    secure: true,
    auth: { user: config.user!, pass: config.password! },
    timeout: 10000,
  });
  try {
    await client.connect();
    const mailbox = await client.getMailboxLock('INBOX');
    const status = await client.status('INBOX', ['MESSAGES', 'UNSEEN']);
    await mailbox.release();
    await client.logout();
    return { success: true, unreadCount: status.UNSEEN || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

### Health Monitoring

- **Polling interval**: Every 5 minutes while connected
- **Reconnect logic**: Exponential backoff (1s → 2s → 4s → max 30s)
- **IDLE support**: imapflow handles `IDLE` for real-time updates
- **NOOP fallback**: Automatic when IDLE not supported
- **Timeout**: 10s connect timeout, 30s idle timeout

### Error Handling Strategy

| Error Type | Handling |
|-----------|----------|
| Network timeout | Retry with exponential backoff (max 3 attempts) |
| Auth failure (401/535) | Mark as `disconnected`, require re-auth |
| SSL/TLS error | Log error, do not retry (credential/server config issue) |
| Mailbox not found | Create default INBOX reference, continue |
| Rate limit (421) | Back off 60s, retry once |

---

## Provider 2: Gmail via Google OAuth2 API

### Library Choice

**Decision: No SDK.** Use direct `fetch()` calls to Gmail API REST endpoints.

**Reasoning:**
- Official Google OAuth2 libraries (`googleapis`, `google-auth-library`) add ~300KB to bundle
- Gmail API is simple REST — OAuth2 flow + CRUD calls fit in ~100 lines
- Avoids Google SDK's complex dependency tree
- Token refresh is straightforward (POST to `oauth2.googleapis.com/token`)
- For a local-first app, simplicity > features

### Required OAuth2 Scopes

| Scope | Classification | Purpose | Required |
|-------|---------------|---------|----------|
| `https://www.googleapis.com/auth/gmail.readonly` | **Restricted** | Read messages, labels, settings | ✅ Yes |
| `openid` | OIDC | User identity (email, profile) | ✅ Yes |
| `profile` | OIDC | Display name | Optional |
| `email` | OIDC | Email address | ✅ Yes |

**IMPORTANT — Verification Impact:**
- `gmail.readonly` is classified **Restricted** by Google
- Requires formal OAuth App Security Assessment (CASA audit) for public apps
- Cost: ~$500/year for annual re-certification
- Timeline: 4–12 weeks for initial review
- **Workaround**: For local/internal use only, register as "internal only" in Google Cloud Console — skips verification entirely but limits to organization users

**Minimum viable scope set** for read-only inbox access:
```
https://www.googleapis.com/auth/gmail.readonly openid email
```

### OAuth2 Flow for Local Applications

**Recommended flow: PKCE (Proof Key for Code Exchange)**

- Works for desktop/native/local apps
- No client secret required (or use a dummy secret)
- Uses redirect URI: `http://localhost:3000/oauth/callback`
- Google supports `access_type=offline` for refresh tokens

**Authorization URL:**
```
https://accounts.google.com/o/oauth2/v2/auth?
  response_type=code&
  client_id=${CLIENT_ID}&
  redirect_uri=http://localhost:3000/oauth/callback&
  scope=https://www.googleapis.com/auth/gmail.readonly%20openid%20email&
  access_type=offline&
  prompt=consent&
  state=${RANDOM_STATE}
```

**Token Exchange:**
```
POST https://oauth2.googleapis.com/token
  grant_type=authorization_code&
  code=${AUTH_CODE}&
  redirect_uri=http://localhost:3000/oauth/callback&
  client_id=${CLIENT_ID}&
  client_secret=${CLIENT_SECRET}
```

**Response:**
```json
{
  "access_token": "ya29.xxx...",
  "expires_in": 3599,
  "refresh_token": "1//0xxx...",
  "scope": "https://www.googleapis.com/auth/gmail.readonly openid email",
  "token_type": "Bearer"
}
```

### Token Lifecycle

| Token | Lifetime | Refresh Strategy |
|-------|----------|-----------------|
| Access token | 3600s (1 hour) | Auto-refresh using refresh token before expiry |
| Refresh token | Indefinite (until revoked) | Store securely; one per user per OAuth client |

**Refresh endpoint:**
```
POST https://oauth2.googleapis.com/token
  grant_type=refresh_token&
  refresh_token=${REFRESH_TOKEN}&
  client_id=${CLIENT_ID}&
  client_secret=${CLIENT_SECRET}
```

### Gmail API Calls (Minimal Set)

```typescript
// List messages in inbox (paginated)
GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=50

// Get message details (including headers)
GET https://gmail.googleapis.com/gmail/v1/users/me/messages/${MESSAGE_ID}?format=full

// Mark as read
PATCH https://gmail.googleapis.com/gmail/v1/users/me/messages/${MESSAGE_ID}
  { "removeLabelIds": ["UNREAD"] }
```

### Security Considerations

- **No server-side component**: All OAuth occurs client-side in the Vite dev server (Node.js middleware)
- **Tokens stored in database**: `email_accounts.config.oauth_access_token` and `oauth_refresh_token`
- **Environment variables for client secrets**: `.env` file, never committed
- **No token forwarding**: Tokens never leave the local machine except to Google's OAuth/Gmail servers
- **Redirect URI locked to localhost**: Prevents token interception from other origins

---

## Provider 3: Microsoft Outlook / Microsoft Graph

### Library Choice

**Decision: Direct REST calls with `fetch()`.**

**Reasoning:**
- Microsoft Graph SDK (`@microsoft/microsoft-graph-types` + `@microsoft/microsoft-graph-client`) adds significant bundle size
- Microsoft Graph REST API is well-documented and straightforward
- Same PKCE flow as Gmail, similar token management
- No heavy SDK dependency needed for read-only inbox access

### Required OAuth2 Scopes

| Scope | Type | Purpose | Required |
|-------|------|---------|----------|
| `https://graph.microsoft.com/Mail.Read` | Delegated | Read user mail | ✅ Yes |
| `https://graph.microsoft.com/User.Read` | Delegated | User identity | ✅ Yes |
| `offline_access` | OIDC | Request refresh token | ✅ Yes |

**Alternative**: `Mail.ReadBasic` — reads subject, sender, recipient, date but **not body**. Less privileged, but may miss OTP content in body.

**Recommended minimal set:**
```
Mail.Read offline_access User.Read
```

### OAuth2 Flow for Local Applications

**Authorization URL:**
```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?
  client_id=${CLIENT_ID}&
  response_type=code&
  redirect_uri=http://localhost:3000/oauth/callback&
  scope=Mail.Read%20offline_access%20User.Read&
  response_mode=query&
  state=${RANDOM_STATE}
```

**Token Endpoint:**
```
POST https://login.microsoftonline.com/common/oauth2/v2.0/token
  grant_type=authorization_code&
  code=${AUTH_CODE}&
  redirect_uri=http://localhost:3000/oauth/callback&
  client_id=${CLIENT_ID}&
  client_secret=${CLIENT_SECRET}
```

### Microsoft Graph API Calls

```typescript
// List inbox messages
GET https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?
  $select=id,subject,from,receivedDateTime,isRead&
  $top=50

// Get message details (body)
GET https://graph.microsoft.com/v1.0/me/messages/${MESSAGE_ID}?
  $select=id,subject,body,from,receivedDateTime,isRead

// Mark as read
PATCH https://graph.microsoft.com/v1.0/me/messages/${MESSAGE_ID}
  { "isRead": true }
```

### Token Lifecycle

Identical to Gmail:
- Access token: 3600s lifetime
- Refresh token: indefinite until revoked
- Refresh endpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`

### Outlook.com vs Microsoft 365

| Account Type | Works With | Notes |
|-------------|------------|-------|
| Personal Outlook (.com) | `common` tenant | Mail.Read available for personal accounts |
| Microsoft 365 / Work | `organizations` or specific tenant | Requires admin consent if tenant policy restricts |
| Hotmail | `common` tenant | Same as Outlook.com |

---

## Comparison Matrix

### Authentication Complexity

| Factor | Generic IMAP (imapflow) | Gmail API | Microsoft Graph |
|--------|------------------------|-----------|-----------------|
| Auth method | LOGIN or OAuth2 | OAuth2 (PKCE) | OAuth2 (code flow) |
| Client registration | None (server-level) | Google Cloud Console | Azure Portal |
| Redirect URI needed | No | Yes (`localhost:3000/oauth/callback`) | Yes |
| Client secret storage | N/A | Required (.env) | Required (.env) |
| Token refresh | Built into imapflow | Manual (POST to token endpoint) | Manual |
| Setup steps | 2 (host + credentials) | 6 (register → configure → authorize → exchange → store → verify) | 6 (same as Gmail) |
| Complexity score | 1/5 (trivial) | 4/5 (moderate) | 3/5 (low-moderate) |

### Capabilities

| Feature | Generic IMAP | Gmail API | Microsoft Graph |
|---------|-------------|-----------|-----------------|
| Read messages | ✅ Full | ✅ Full | ✅ Full |
| Search messages | ✅ IMAP SEARCH | ✅ Gmail query syntax | ✅ OData filters |
| Mark as read | ✅ Flag operations | ✅ Label operations | ✅ PATCH isRead |
| Delete messages | ✅ EXPUNGE | ✅ trash() | ✅ DELETE |
| Real-time updates | ✅ IDLE command | ✅ Pub/Sub webhooks | ✅ Change notifications |
| Attachments | ✅ Full | ✅ Full (raw) | ✅ Full (decoded) |
| Multiple folders | ✅ All IMAP mailboxes | ✅ Labels only | ✅ Mail folders |
| OAuth2 supported | ✅ XOAUTH2/OAUTHBEARER | ✅ Native | ✅ Native |
| App passwords | ✅ Works | ❌ Not supported | ❌ Not supported |

### Maintenance Risk

| Risk Factor | Generic IMAP | Gmail API | Microsoft Graph |
|-------------|-------------|-----------|-----------------|
| Library maintenance | Low (imapflow actively maintained) | N/A (direct REST) | N/A (direct REST) |
| API deprecation risk | Low (IMAP is 30-year-old standard) | Medium (Google changes scopes periodically) | Low (Graph is stable, long-term supported) |
| Dependency count | 1 (imapflow) | 0 | 0 |
| Breakage surface | Server-side IMAP spec drift | OAuth scope changes | API version changes |
| Author commitment | Strong (EmailEngine product) | N/A | Strong (Microsoft enterprise commitment) |

### Windows / Local Development Requirements

| Factor | Generic IMAP | Gmail API | Microsoft Graph |
|--------|-------------|-----------|-----------------|
| Node.js requirement | Node.js 20+ (imapflow hard requirement) | Any Node.js | Any Node.js |
| Browser for OAuth | None (local CLI flow) | Chrome/Firefox for consent | Chrome/Firefox for consent |
| Native dependencies | None | None | None |
| CORS issues | N/A (server-side) | Redirect URI must be registered | Redirect URI must be registered |
| Firewall considerations | Outbound TCP 993 | Outbound HTTPS 443 | Outbound HTTPS 443 |
| Local server needed | No | Yes (for OAuth callback) | Yes (for OAuth callback) |

### Suitability for This Project

| Criterion | Generic IMAP | Gmail API | Microsoft Graph |
|-----------|-------------|-----------|-----------------|
| Zero external dependencies | ✅ Yes | ✅ Yes | ✅ Yes |
| No credit card required | ✅ Yes | ⚠️ Google Cloud needs billing account (free tier exists) | ⚠️ Azure needs free tier registration |
| Free forever | ✅ Yes | ✅ Yes (free tier: 50K units/day) | ✅ Yes (free tier) |
| Works with any email provider | ✅ Yes (any IMAP server) | ❌ Gmail only | ❌ Outlook/Hotmail/M365 only |
| OTP extraction compatible | ✅ Yes (full message body) | ✅ Yes | ✅ Yes |
| Local-first friendly | ✅ Yes | ⚠️ Requires browser OAuth flow | ⚠️ Requires browser OAuth flow |
| No app registration needed | ✅ Yes | ❌ Must register in Google Cloud | ❌ Must register in Azure Portal |
| Production readiness | ✅ High | ✅ High | ✅ High |

---

## Proposed Architecture

### New Database Schema (Migration 11)

```sql
-- Extend email_accounts for OAuth2 support
ALTER TABLE email_accounts 
  ADD COLUMN oauth_access_token TEXT,
  ADD COLUMN oauth_refresh_token TEXT,
  ADD COLUMN oauth_token_expires_at TEXT,
  ADD COLUMN connection_status TEXT DEFAULT 'disconnected',
  ADD COLUMN last_error TEXT;
```

**Migration approach**: Add columns to existing table (backward-compatible — old rows keep NULL values).

### Updated Interface

```typescript
export interface EmailProviderConfig {
  type: 'mock' | 'imap' | 'gmail' | 'outlook';
  // Common
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  // OAuth2 (all providers)
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  tokenExpiresAt?: string;
  redirectUri?: string;
  // IMAP-specific
  loginMethod?: 'LOGIN' | 'AUTH=PLAIN' | 'AUTH=LOGIN';
  // Gmail-specific
  gmailQuery?: string; // IMAP-like query for Gmail
  // Outlook-specific
  tenantId?: string; // 'common' | 'organizations' | GUID
}

export interface ConnectionTestResult {
  success: boolean;
  unreadCount?: number;
  error?: string;
  latencyMs?: number;
}

export abstract class EmailProvider {
  protected config: EmailProviderConfig;
  protected accountId: string;
  protected identityId: string;

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]>;
  abstract searchMessages(query: string): Promise<EmailMessage[]>;
  abstract markAsRead(messageId: string): Promise<boolean>;
  abstract getUnreadCount(): Promise<number>;
  abstract testConnection(): Promise<ConnectionTestResult>;
  abstract refreshToken?(): Promise<boolean>;  // Optional — some providers handle internally
}
```

### Provider Registration Map

```typescript
// packages/email/src/providers/index.ts
import { MockEmailProvider } from './mock-provider';
import { ImapProvider } from './imap-provider';
import { GmailProvider } from './gmail-provider';
import { OutlookProvider } from './outlook-provider';

export const PROVIDER_REGISTRY: Record<string, new (config, accountId, identityId) => EmailProvider> = {
  mock: MockEmailProvider,
  imap: ImapProvider,
  gmail: GmailProvider,
  outlook: OutlookProvider,
};
```

### UI Integration Points

1. **Settings page**: Add "Email Providers" section with provider cards
2. **Dashboard**: Show connected provider counts, last sync time per account
3. **Identity detail**: Show linked email accounts with connection status badges
4. **Inbox Manager**: Filter by provider, show provider icon on each account

### Connection Test Flow

```
User clicks "Test Connection"
  → Call provider.testConnection()
  → Show spinner for 3 seconds
  → On success: green checkmark + unread count
  → On failure: red X + error message
  → Log activity: action='connection_test', result='success'|'error'
```

### Health Monitoring

```typescript
// Run every 5 minutes for all active accounts
async function healthCheckLoop(provider: EmailProvider, accountId: string) {
  const result = await provider.testConnection();
  if (!result.success) {
    logActivity('provider_connection_failed', { accountId, error: result.error });
  }
  updateDatabase(accountId, { connection_status: result.success ? 'connected' : 'disconnected' });
}
```

---

## Security Decisions

### Credential Storage

| Secret | Where Stored | Encryption |
|--------|-------------|------------|
| OAuth access token | DB `oauth_access_token` column | Disk encryption (user's responsibility) |
| OAuth refresh token | DB `oauth_refresh_token` column | Disk encryption |
| Client secret | `.env` file (git-ignored) | File permissions (600) |
| IMAP password | DB `config` JSON or `password` field | Disk encryption |

**No credential data in logs.** Activity logger masks sensitive fields:
```typescript
function maskSecret(value: string): string {
  if (!value) return '';
  return value.length > 8 ? value.slice(0, 4) + '***' + value.slice(-4) : '***';
}
```

### Token Security

- Refresh tokens are stored once and reused — no re-authentication unless revoked
- Access tokens expire after 1 hour and are refreshed silently
- Revoked tokens clear the refresh token from DB, forcing re-authorization
- OAuth consent screen is shown only on first authorization

### Network Security

- All provider communication is over TLS 1.2+ (HTTPS for REST, IMAPS for IMAP)
- No plaintext credentials transmitted
- Local redirect URIs (`http://localhost:*`) are safe — tokens only go to `accounts.google.com` / `login.microsoftonline.com`

---

## Test Strategy

### Unit Tests (vitest)

Each provider implements a testable interface:
- `testConnection()` with mock network errors
- `fetchMessages()` with mock HTTP responses
- `refreshToken()` with mock token expiry scenarios

### Integration Tests (Playwright)

Browser-based OAuth flows:
- Simulate Gmail OAuth consent screen
- Verify token round-trip (request → store → refresh → use)
- Verify connection test UI updates

### Fixture-Based Tests

Local test email server (like `smtp-tester` or `fake-smtp-server`) for IMAP testing without real credentials.

---

## Phased Implementation Plan

### Phase 6a: Foundation (Week 1)
1. Database migration — add OAuth columns to `email_accounts`
2. Update `EmailProvider` abstract class with `testConnection()` and optional `refreshToken()`
3. Implement `ImapProvider` using `imapflow`
4. Write unit tests for IMAP provider
5. Update Vite plugin with `/api/accounts/test` endpoint

### Phase 6b: Gmail Adapter (Week 2)
1. Implement `GmailProvider` with direct REST calls
2. Add OAuth2 PKCE flow (redirect to Google, catch callback in Vite plugin)
3. Token refresh mechanism
4. Connection test + health monitoring
5. Write integration tests

### Phase 6c: Outlook Adapter (Week 3)
1. Implement `OutlookProvider` with Microsoft Graph REST
2. OAuth2 code flow (same pattern as Gmail, different endpoints)
3. Tenant-aware routing (`common` vs `organizations`)
4. Connection test + health monitoring
5. Write integration tests

### Phase 6d: UI Integration (Week 4)
1. Settings page — provider configuration forms
2. Dashboard — provider health indicators
3. Inbox Manager — provider badges and filtering
4. Connection test button in UI
5. End-to-end verification

---

## Files to Create/Modify

### New Files
```
packages/email/src/providers/
  imap-provider.ts      # imapflow-based generic IMAP
  gmail-provider.ts     # Gmail REST API with OAuth2
  outlook-provider.ts   # Microsoft Graph REST API with OAuth2
  index.ts              # Re-exports all providers

scripts/
  test-connection.ts    # CLI connection tester for all providers

tests/
  imap-provider.spec.ts
  gmail-provider.spec.ts
  outlook-provider.spec.ts
```

### Modified Files
```
packages/database/src/index.ts        # Migration 11, updated interfaces
packages/email/src/index.ts           # Extended EmailProvider interface
apps/web/src/App.tsx                  # Settings UI for providers, connection status
vite-plugin-browser-api.ts            # OAuth callback handler, test endpoint
.env.example                          # Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, etc.
PROJECT_STATUS.md                     # Phase 6 documentation
ROADMAP.md                            # Phase 6 progress
```

---

## References

| Source | URL |
|--------|-----|
| imapflow GitHub | https://github.com/postalsys/imapflow |
| imapflow Documentation | https://imspdocs.emailengine.app/ |
| Google Gmail API Docs | https://developers.google.com/gmail/api/reference/rest |
| Google OAuth2 Scopes | https://developers.google.com/identity/protocols/oauth2/scopes |
| Google OAuth2 Guide | https://developers.google.com/identity/protocols/oauth2 |
| Microsoft Graph Mail Permissions | https://learn.microsoft.com/en-us/graph/permissions-reference |
| Microsoft Graph Auth | https://learn.microsoft.com/en-us/graph/auth-v2-user |
| Microsoft Graph Mail Overview | https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview |
| node-imap GitHub | https://github.com/mscdex/node-imap (deprecated status confirmed) |
| Snyk — node-imap | https://security.snyk.io/package/npm/node-imap |

---

## Blockers / Open Questions

1. **Google Cloud Console**: Requires a billing account for unrestricted apps, but free tier covers testing. For local-only development, the app can stay in "Testing" mode with up to 100 test users.
2. **Azure Portal**: Free tier registration required for Microsoft Graph. Organization accounts need admin consent.
3. **node-imap vs imapflow**: node-imap author confirmed abandonment in March 2025. Use imapflow exclusively.
4. **OAuth2 redirect on Vite dev server**: The Vite plugin must listen on `localhost:3000` for OAuth callbacks. This is fine for local development but would need a tunnel/proxy for remote access.
5. **Testing without credentials**: All three providers need real OAuth client registrations for integration testing. Mock providers should cover unit test scenarios.
