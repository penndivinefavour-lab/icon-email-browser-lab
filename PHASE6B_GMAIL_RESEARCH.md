# Phase 6b — Gmail OAuth2 Provider: Research & Architecture Checkpoint

**Date**: October 1, 2026
**Status**: Research complete · Implementation pending (Phase 6b)
**Base commit**: `b8ab370` — Phase 6a (IMAP provider + credential isolation)

---

## 1. Sources Consulted

| Source | URL | What it confirmed |
|--------|-----|-------------------|
| Google OAuth 2.0 Overview | https://developers.google.com/identity/protocols/oauth2 | Basic flows, refresh token expiry rules, Web Server vs Installed app types |
| Gmail API Scopes Guide | https://developers.google.com/workspace/gmail/api/auth/scopes | Scope classification (non-sensitive / sensitive / restricted), exact scope strings |
| Gmail API Messages.List REST | https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list | Required scopes for message listing; query syntax; pagination |
| Gmail API Quotas | https://developers.google.com/workspace/gmail/api/reference/quota | Per-method quota units (messages.list = 5, messages.get = 20); per-user/s-project limits |
| Google Auth Platform Console | https://support.google.com/cloud/answer/13807380 | Testing mode, test user cap, 7-day expiry, verification requirements |
| Nylas OAuth Troubleshooting Guide | https://developer.nylas.com/docs/cookbook/use-cases/build/fix-google-access-denied | Detailed tier breakdown (non-sensitive → sensitive → restricted), CASA audit implications |
| Google OAuth 2.0 for Web Server Apps | https://developers.google.com/identity/protocols/oauth2/web-server | Authorization code flow, redirect URI handling, token exchange format |

---

## 2. Scope Analysis

### 2.1 Recommended Scopes for This Application

The application needs to **read** Gmail messages only — no send, no delete, no compose. The minimal scope is:

```
https://www.googleapis.com/auth/gmail.readonly
```

This is a **restricted** scope (Tier 3) that requires:
- Brand verification (2–6 weeks)
- CASA Tier 2 security assessment (annual recurring)

**Why not narrower?** `gmail.metadata` only exposes headers and labels, not message bodies — but this app needs body content for OTP extraction. `gmail.compose` and `gmail.modify` are broader than needed and add verification burden.

### 2.2 Identity Scopes (Optional)

If we want to discover the user's identity from Google:

```
openid
https://www.googleapis.com/auth/userinfo.email
```

These are **non-sensitive** — no verification required. The email is useful for matching to an existing identity in our database.

### 2.3 Updated Scope Set

For Phase 6b implementation:

| Scope | Purpose | Tier |
|-------|---------|------|
| `openid` | Identity discovery (optional) | Non-sensitive |
| `https://www.googleapis.com/auth/gmail.readonly` | Message listing and fetching | Restricted |

**Note**: `gmail.readonly` triggers CASA audit for external apps. For **internal/local development only** (owner testing), this is manageable in Testing mode with the app owner as the sole test user.

### 2.4 Previous Research Assumption Verification

The Phase 6 research (`PHASE6_PROVIDER_RESEARCH.md`) recommended `gmail.readonly`, `openid`, and `email`. Verification:

| Proposed Scope | Status | Notes |
|---------------|--------|-------|
| `gmail.readonly` | ✅ Still current and appropriate | Minimal read-only scope; required for body content |
| `openid` | ✅ Still appropriate | Identity discovery; non-sensitive |
| `email` | ⚠️ Use `userinfo.email` instead | The bare `email` scope is ambiguous; Google's OIDC spec uses `https://www.googleapis.com/auth/userinfo.email` |
| `profile` | ⚠️ Optional | Not needed unless we display the user's Google profile picture/name |

**Conclusion**: The scope set is still correct. Replace `email` with `userinfo.email` for clarity. Add `openid` explicitly for the ID token.

---

## 3. OAuth Flow Design

### 3.1 Flow Architecture: Server-Side Authorization Code Flow

Since this is a local Vite dev server (Node.js backend), we use the **Authorization Code Flow with PKCE** — the most secure option for local development where the client secret can be safely stored.

**However**, for maximum security and to avoid exposing the client secret in browser bundle, we use the **server-side flow**:

```
UI Clicks "Connect Gmail"
    │
    ▼
Backend generates state + PKCE challenge
    │
    ▼
Redirects browser to Google OAuth consent screen
    │
    ▼
User authorizes → Google redirects to http://localhost:3000/oauth2callback?code=XXX&state=YYY
    │
    ▼
Backend validates state, exchanges code for tokens via POST to oauth2.googleapis.com/token
    │
    ▼
Stores refresh_token + access_token (expired_at) in email_credentials table
    │
    ▼
Returns success to UI; UI polls /api/email/accounts/:id for connection status
```

### 3.2 OAuth Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/email/accounts/:id/connect` | POST | Initiate OAuth flow; return authorization URL |
| `/oauth2callback` | GET | Google callback; exchange code for tokens |
| `/api/email/accounts/:id/test` | POST | Test connection using stored tokens (refreshes if expired) |
| `/api/email/accounts/:id/disconnect` | POST | Revoke token and delete credentials |

### 3.3 Redirect URI

For local development:
```
http://localhost:3000/oauth2callback
```

Must be registered in Google Cloud Console under "Authorized redirect URIs".

### 3.4 Security Properties

- **CSRF protection**: `state` parameter generated server-side, stored in session/memory, validated on callback
- **PKCE**: `code_verifier` generated server-side, `code_challenge` sent to Google
- **Token storage**: Refresh token and access token stored in `email_credentials` table (same isolation as IMAP passwords)
- **No secrets in logs/UI**: All tokens scrubbed by existing `CredentialStore`

---

## 4. Token Lifecycle & Storage

### 4.1 Token Format

Google OAuth2 token response:

```json
{
  "access_token": "ya29.xxx...",
  "expires_in": 3599,
  "refresh_token": "1//0xxx...",
  "scope": "https://www.googleapis.com/auth/gmail.readonly openid",
  "token_type": "Bearer",
  "id_token": "eyJ..."
}
```

### 4.2 Storage Strategy

Using the existing `email_credentials` table:

| credential_ref | secret_kind | secret_value |
|---------------|-------------|--------------|
| `gmail_access_token:<accountId>` | `access_token` | `ya29.xxx...` |
| `gmail_refresh_token:<accountId>` | `refresh_token` | `1//0xxx...` |

The `EmailProviderConfig` for Gmail stores:
```json
{
  "type": "gmail",
  "clientId": "<from env>",       // NOT stored per-account; loaded from env at runtime
  "clientSecret": "<from env>",     // NOT stored per-account; loaded from env at runtime
  "redirectUri": "http://localhost:3000/oauth2callback"
}
```

### 4.3 Token Refresh

Access tokens expire in ~1 hour. The provider must:
1. Check if `expires_in` has passed before each API call
2. If expired, POST to `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`
3. Update stored access token in credential store
4. Retry original request

### 4.4 Refresh Token Expiry Conditions

Refresh tokens expire when:
- User revokes app access
- Token unused for 6 months
- User changes password (for Gmail-scoped tokens)
- App is in **Testing mode** and external user (7-day expiry)
- More than 100 live refresh tokens exist for this client+account pair

**Implication**: The app must handle `invalid_grant` errors gracefully and prompt re-authentication.

---

## 5. OAuth Consent & Testing Configuration

### 5.1 Google Cloud Console Setup Steps

1. Create project at https://console.cloud.google.com/
2. Enable Gmail API: APIs & Services → Library → Gmail API → Enable
3. Configure OAuth consent screen:
   - User type: **External** (for personal Gmail access) or **Internal** (for Workspace org only)
   - App name, support email, developer contact
   - Add scopes: `gmail.readonly`, `openid`, `userinfo.email`
4. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/oauth2callback`
   - Save Client ID and Client Secret

### 5.2 Testing Mode Implications

| Aspect | Testing Mode | Production Mode |
|--------|-------------|-----------------|
| Max users | 100 test users | Unlimited |
| Token expiry (test users) | 7 days | Standard (until revoked/6mo inactivity) |
| Verification required | No | Yes (brand + CASA for restricted scopes) |
| Warning shown | "Unverified app" warning | Clean consent screen (if verified) |

**For Phase 6b development**: The app owner adds their own Google account as a test user. The 7-day token expiry is acceptable for development; re-authorize weekly during testing.

### 5.3 Restricted Scope Verification

`gmail.readonly` is a **restricted scope**. If publishing externally:
- Brand verification required (2–6 weeks)
- CASA Tier 2 security assessment required (annual renewal)
- Unverified apps show yellow warning; users must click "Advanced > Go to [app]"

**For local/owner-only use**: Testing mode bypasses public verification. The app owner sees the unverified warning but can proceed.

---

## 6. Gmail API Quotas & Limits

### 6.1 Per-Method Quota Units

| Method | Quota Units | Use Case |
|--------|-------------|----------|
| `messages.list` | 5 | Fetch message list |
| `messages.get` | 20 | Fetch single message details |
| `messages.batchGet` | 50 | Batch fetch multiple messages |
| `labels.list` | 1 | List folders/labels |

### 6.2 Rate Limits

| Limit | Value |
|-------|-------|
| Per user per second | 250 quota units (moving average) |
| Per user per minute | 6,000 quota units |
| Per project per minute | 1,200,000 quota units |

### 6.3 Practical Implications

For reading ~100 messages with bodies:
- 1 × `messages.list` call = 5 units
- Up to 100 × `messages.get` calls = 2,000 units (at 20 units each)
- Well within per-user limits even at peak usage

**Optimization**: Use `messages.get` with `format=METADATA` and `metadataHeaders` for subjects only when full body isn't needed.

### 6.4 Pagination

`messages.list` supports `maxResults` (default 100, max 500) and `pageToken` for cursor-based pagination. The provider should page through all results up to the configured limit.

---

## 7. Direct REST vs SDK Decision

### 7.1 Recommendation: Direct HTTPS REST Calls

**Rationale:**

| Factor | Direct REST | @googleapis/gmail (SDK) |
|--------|-------------|------------------------|
| Bundle size | ~2 KB (fetch calls) | ~2 MB (full library) |
| Dependencies | None | googleapis + multiple sub-deps |
| Type safety | Manual typing | Full TypeScript types |
| Token refresh | Manual implementation | Auto-refresh available |
| Maintenance | Minimal | Updates track upstream |
| Customization | Full control | Constrained by SDK API |

**Decision**: Use direct `fetch()` calls. The Gmail API is well-documented with stable REST endpoints. The overhead of a 2 MB SDK dependency is unjustified for a read-only mailbox client.

### 7.2 Google APIs JavaScript Client

The `googleapis` npm package (~2 MB) could be used, but:
- Adds unnecessary dependency weight
- Requires Node.js-specific polyfills in browser context
- Direct fetch is simpler and more transparent for token management

**Verdict**: No SDK. Use direct fetch with proper error handling.

---

## 8. Database Impact Assessment

### 8.1 Existing Schema Sufficiency

Migration #11 already creates:
- `email_credentials` table — stores refresh_token, access_token securely
- `email_account_health` table — tracks connection_status, last_checked_at, unread_count

### 8.2 Required Changes

**None.** The existing schema handles OAuth tokens via the generic credential system:
- `credential_ref` will be `gmail_access_token:<accountId>` and `gmail_refresh_token:<accountId>`
- `secret_kind` distinguishes token types
- The `hasCredentials` flag indicates whether OAuth is complete

### 8.3 Config Field Additions

Gmail accounts will store these in `email_accounts.config` (all non-secret):
```json
{
  "type": "gmail",
  "clientId": "12345.apps.googleusercontent.com",
  "clientSecret": "GOCSPX-xxx",
  "redirectUri": "http://localhost:3000/oauth2callback",
  "scopes": "openid https://www.googleapis.com/auth/gmail.readonly"
}
```

**Security note**: `clientId` and `clientSecret` are loaded from environment variables at runtime, NOT stored in the database config. They should be referenced but not persisted.

---

## 9. Environment Variables

### 9.1 Required

```bash
# .env (add to .gitignore)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-string
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

### 9.2 Optional

```bash
# Default scopes (override per-account if needed)
GOOGLE_DEFAULT_SCOPES=https://www.googleapis.com/auth/gmail.readonly openid
```

### 9.3 Security Contract

- Client ID and secret are **never stored in the database**
- They are loaded from `process.env` at service initialization
- They never appear in API responses, logs, or UI
- Added to `.env.example` with placeholder values
- Documented in `.gitignore`

---

## 10. GmailProvider Interface Design

### 10.1 Class Structure

```typescript
// packages/email/src/gmail-provider.ts
import { EmailProvider, type EmailMessage, type MailboxInfo } from './types';
import { EmailProviderError, classifyProviderError } from './errors';

export interface GmailProviderConfig extends EmailProviderConfig {
  type: 'gmail';
  clientId?: string;      // Loaded from env, optional here
  clientSecret?: string;  // Loaded from env, optional here
  accessToken?: string;   // Populated from credential store at runtime
  refreshToken?: string;  // Populated from credential store at runtime
  scopes?: string[];
}

export class GmailProvider extends EmailProvider {
  private connected = false;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiryMs = 0;

  constructor(
    config: GmailProviderConfig,
    accountId: string,
    identityId: string,
    private readonly tokenLoader: () => Promise<{ accessToken: string; refreshToken: string }>
  ) {
    super(config, accountId, identityId);
  }

  async connect(): Promise<boolean>;
  async disconnect(): Promise<void>;
  async fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]>;
  async searchMessages(query: string): Promise<EmailMessage[]>;
  async markAsRead(messageId: string): Promise<boolean>;
  async getUnreadCount(): Promise<number>;
  async listMailboxes(): Promise<MailboxInfo[]>;
}
```

### 10.2 Token Loader Pattern

The provider receives a `tokenLoader` function injected by the service layer:

```typescript
// In EmailAccountService:
const provider = new GmailProvider(config, accountId, identityId, async () => {
  const tokens = this.credentials.resolveSecret(accountId);
  return {
    accessToken: tokens?.access_token ?? '',
    refreshToken: tokens?.refresh_token ?? '',
  };
});
```

This keeps the provider testable without network and compliant with the existing credential abstraction.

---

## 11. API Integration with Existing Vite Plugin

### 11.1 New Endpoints

| Route | Method | Handler | Description |
|-------|--------|---------|-------------|
| `/api/email/accounts/:id/connect` | POST | InitiateOAuth | Returns `{ authUrl: string }` |
| `/oauth2callback` | GET | HandleCallback | Google callback; exchanges code for tokens |
| `/api/email/accounts/:id/revoke` | POST | RevokeAccess | Revokes token via Google revoke endpoint |

### 11.2 Callback Implementation

```typescript
// In vite-plugin-email-api.ts
if (pathname === '/oauth2callback') {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  // Validate state against stored CSRF token
  // Exchange code for tokens via POST to oauth2.googleapis.com/token
  // Store tokens in credential store
  // Update account health
  // Redirect to /inbox?connected=true
}
```

### 11.3 Integration with Existing Service Layer

The `EmailAccountService.testConnection()` method already handles OAuth providers generically. We add `gmail` support in `createProvider()` in `packages/email/src/index.ts`:

```typescript
case 'gmail':
  return new GmailProvider(config, accountId, identityId, {
    tokenLoader: () => this.credentials.resolveSecret(accountId),
    ...(this.clientFactory ? { clientFactory: this.clientFactory } : {}),
  });
```

---

## 12. Testing Strategy

### 12.1 Mock Strategy for OAuth

Create a fake OAuth server for unit tests:

```typescript
// packages/email/src/testing/fake-gmail-server.ts
import http from 'http';

export function createFakeGmailServer(port: number): {
  server: http.Server;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  revokeEndpoint: string;
} {
  // Simulates Google's OAuth endpoints locally
}
```

### 12.2 Test Categories

| Test | Method | Purpose |
|------|--------|---------|
| `connect()` success | Fake server returns valid token | Verify token exchange |
| `connect()` with invalid code | Fake server returns 400 | Verify error handling |
| `connect()` with wrong state | Fake server ignores state param | Verify CSRF protection |
| `fetchMessages()` with expired token | Fake server returns 401, then 200 after refresh | Verify auto-refresh |
| `fetchMessages()` rate limited | Fake server returns 429 | Verify backoff |
| `disconnect()` revokes token | Fake server records revocation | Verify cleanup |
| `testConnection()` success | Full flow mock | Verify health recording |
| `searchMessages()` with query | Mock REST response | Verify query translation |

### 12.3 Integration Tests

The existing 62 IMAP provider tests and 29 credential isolation tests provide the pattern. Gmail tests will follow the same structure:

```typescript
// packages/email/src/gmail-provider.test.ts
describe('GmailProvider', () => {
  it('connects successfully with valid tokens', async () => { ... });
  it('refreshes expired access tokens automatically', async () => { ... });
  it('handles invalid_grant errors by throwing AUTH_FAILED', async () => { ... });
});
```

---

## 13. UI Additions

### 13.1 Minimal Changes Required

The existing Inbox Manager UI already has a provider selection dropdown. Phase 6a added basic email account management. Gmail needs:

1. **Connect button** in the account panel that initiates the OAuth flow
2. **Status indicator** showing "Connected" / "Disconnected" / "Needs Re-auth"
3. **Revoke button** to disconnect and clean up tokens

### 13.2 No Major UI Overhaul

The existing provider-agnostic design means the UI doesn't need Gmail-specific logic. The `ConnectionTestResult` interface already handles all provider types uniformly.

---

## 14. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `packages/email/src/gmail-provider.ts` | GmailProvider implementing EmailProvider using direct REST |
| `packages/email/src/gmail-provider.test.ts` | Unit tests for Gmail provider (mocked OAuth server) |
| `vite-plugin-oauth.ts` | Vite middleware for `/oauth2callback` endpoint |
| `packages/email/src/testing/fake-gmail-server.ts` | Fake Google OAuth + REST server for tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/email/src/index.ts` | Export `GmailProvider`; add `'gmail'` case in `createProvider()` |
| `packages/email/src/types.ts` | Add `GmailProviderConfig` type extending `EmailProviderConfig` |
| `packages/email/src/errors.ts` | Add `OAUTH_FAILED`, `TOKEN_EXPIRED` error codes |
| `packages/email/src/credentials.ts` | Add `refreshToken` to `SECRET_FIELDS` (already present) |
| `vite-plugin-email-api.ts` | Add `/api/email/accounts/:id/connect` and `/api/email/accounts/:id/revoke` endpoints |
| `apps/web/src/App.tsx` | Add "Connect Gmail" button in account panel |
| `package.json` | Add `nock` or keep native `fetch` (no new deps needed) |
| `.env.example` | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |

### Database Impact

**None required.** Migration #11 schema is sufficient for storing OAuth tokens.

---

## 15. Implementation Sequence

### Phase 6b.1 — Core Provider (No UI)
1. Create `GmailProvider` class in `gmail-provider.ts`
2. Implement OAuth token exchange via direct fetch
3. Implement auto-refresh on expired tokens
4. Implement `fetchMessages()`, `searchMessages()`, `markAsRead()`, `getUnreadCount()`, `listMailboxes()`
5. Write unit tests with fake OAuth server
6. Integrate into `createProvider()` factory

### Phase 6b.2 — API Integration
1. Add `/api/email/accounts/:id/connect` endpoint
2. Add `/oauth2callback` handler in Vite plugin
3. Add `/api/email/accounts/:id/revoke` endpoint
4. Update `EmailAccountService` to support OAuth token loading
5. Add API integration tests

### Phase 6b.3 — UI & Polish
1. Add "Connect Gmail" button in Inbox Manager
2. Show connection status with token expiry warning
3. Add revoke/disconnect functionality
4. Update provider list in `/api/email/providers` to `status: 'ready'`
5. Run full test suite verification

---

## 16. Security Checklist

- [ ] Client ID/Secret loaded from env only, never from DB or source
- [ ] Refresh tokens stored in `email_credentials` table (same isolation as IMAP passwords)
- [ ] Access tokens never logged, never returned in API responses
- [ ] State parameter validated on callback (CSRF protection)
- [ ] PKCE challenge validated on token exchange
- [ ] Error messages scrubbed of tokens via existing `scrubSecrets()`
- [ ] `.env` file in `.gitignore`
- [ ] No real credentials in test fixtures or mock data

---

## 17. Blockers & Risks

| Risk | Mitigation |
|------|------------|
| CASA audit required for `gmail.readonly` | Accept for now; app runs in Testing mode with owner as test user |
| 7-day token expiry in Testing mode | Re-authorize weekly during dev; production verification removes this limit |
| Google blocking localhost redirects | Register `http://localhost:3000/oauth2callback` exactly in Console |
| External users cannot test in Testing mode | Document that only added test users can authorize; owner-testing model |
| `gmail.readonly` restricted scope | Consider `gmail.metadata` for initial Phase 6b.1 to avoid CASA audit, upgrade later |

---

## 18. Commit & Push Plan

When Phase 6b implementation begins, expected commit structure:
1. `feat(Phase 6b): Gmail OAuth2 provider with direct REST integration` — core provider + tests
2. `feat(Phase 6b): OAuth callback endpoint and API wiring` — Vite plugin + service layer
3. `feat(Phase 6b): Gmail connect UI in Inbox Manager` — frontend changes

This checkpoint document (`PHASE6B_GMAIL_RESEARCH.md`) will be committed first to record the research findings.

---

*Research completed: October 1, 2026*
*Implementation deferred to Phase 6b as specified.*
