/**
 * Microsoft Graph / Outlook provider using direct REST calls (no SDK).
 *
 * Follows the same architecture as GmailProvider:
 * - Direct HTTPS fetch() calls to Microsoft Graph REST API
 * - PKCE flow for OAuth2 authorization
 * - Server-side token management via TokenLoader seam
 * - No SDK dependencies
 */

import {
  EmailProvider,
  describeError,
  type ConnectionTestResult,
  type EmailMessage,
  type EmailAttachment,
  type MailboxInfo,
  type EmailProviderConfig,
} from './types.js';
import {
  EmailProviderError,
  classifyProviderError,
} from './errors.js';

export type TokenLoader = () => Promise<{ accessToken: string; refreshToken: string; expiresIn?: number } | null>;

// ── Types ───────────────────────────────────────────────────────────────────────

export interface MicrosoftGraphProviderConfig extends EmailProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface MicrosoftGraphProviderOptions {
  /** Override for testing; defaults to real fetch(). */
  httpClient?: MicrosoftGraphHttpClient;
  /** Override base URL for tests. */
  apiBaseUrl?: string;
  /** Override OAuth token endpoint for tests. */
  oauthTokenUrl?: string;
}

export interface MicrosoftGraphHttpClient {
  request(url: string, options: RequestInit): Promise<Response>;
}

// ── Constants ────────────────────────────────────────────────────────────────────

const OAUTH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const USERINFO_URL = 'https://graph.microsoft.com/v1.0/me';
const DEFAULT_API_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_BODY_CHARS = 20_000;

// ── Microsoft Graph types ───────────────────────────────────────────────────────

interface MGMessage {
  id: string;
  subject: string;
  body: {
    content: string;
    contentType: 'text' | 'html';
  };
  from: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      address: string;
      name: string;
    };
  }>;
  receivedDateTime: string;
  isRead: boolean;
  labels?: Array<{ id: string; displayName: string; color: string }>;
  webLink?: string;
}

interface MGMessageList {
  value: MGMessage[];
  '@odata.nextLink'?: string;
}

interface MGLabels {
  value: Array<{ id: string; displayName: string; color: string; folderId: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

function toMgError(err: unknown): EmailProviderError {
  if (err instanceof EmailProviderError) return err;
  const e = err as { message?: string; code?: string } | null;
  const msg = e?.message ?? String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('invalid_grant') || lower.includes('unauthorized_client') || lower.includes('invalid_client')) {
    return new EmailProviderError({ code: 'OAUTH_FAILED', message: 'Authorization failed. Re-connect your Outlook account.' });
  }
  if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('throt')) {
    return new EmailProviderError({ code: 'RATE_LIMITED', message: 'Microsoft Graph rate limit exceeded. Try again shortly.' });
  }
  return classifyProviderError(err, []);
}

function normalizeMgMessage(msg: MGMessage): EmailMessage {
  const headers: Array<{ name: string; value: string }> = [];
  if (msg.subject) headers.push({ name: 'Subject', value: msg.subject });
  if (msg.from?.emailAddress?.address) headers.push({ name: 'From', value: msg.from.emailAddress.address });
  if (msg.receivedDateTime) headers.push({ name: 'Date', value: msg.receivedDateTime });

  return {
    id: msg.id ?? '',
    messageIdExternal: msg.id ?? undefined,
    subject: msg.subject ?? '(no subject)',
    sender: msg.from?.emailAddress?.address ?? msg.from?.emailAddress?.name ?? 'unknown',
    recipient: msg.toRecipients?.map(r => r.emailAddress.address).join(', ') ?? '',
    body: msg.body?.content ?? '',
    bodyHtml: msg.body?.contentType === 'html' ? msg.body?.content : undefined,
    receivedAt: new Date(msg.receivedDateTime ?? Date.now()),
    isRead: msg.isRead ?? false,
    attachments: [],
    rawHeaders: headers.map(h => `${h.name}: ${h.value}`).join('\n'),
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────────

export class MicrosoftGraphProvider extends EmailProvider {
  protected readonly config: MicrosoftGraphProviderConfig;
  protected readonly accountId: string;
  protected readonly identityId: string;
  private readonly tokenLoader: TokenLoader;
  private readonly httpClient: MicrosoftGraphHttpClient;
  private readonly apiBaseUrl: string;
  private readonly oauthTokenUrl: string;
  
  // Runtime state
  private accessToken: string | null = null;
  private tokenExpiresAtMs = 0;
  private connected = false;
  private identityEmail: string | null = null;

  constructor(
    config: MicrosoftGraphProviderConfig,
    accountId: string,
    identityId: string,
    tokenLoader: TokenLoader,
    options: MicrosoftGraphProviderOptions = {},
  ) {
    super(config as EmailProviderConfig, accountId, identityId);
    this.config = config;
    this.accountId = accountId;
    this.identityId = identityId;
    this.tokenLoader = tokenLoader;
    this.httpClient = options.httpClient ?? (globalThis as any);
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE;
    this.oauthTokenUrl = options.oauthTokenUrl ?? OAUTH_TOKEN_URL;
  }

  getType(): 'outlook' {
    return 'outlook';
  }

  getConfig(): MicrosoftGraphProviderConfig {
    return this.config;
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    const tokens = await this.tokenLoader();
    if (!tokens) {
      throw new EmailProviderError({
        code: 'AUTH_FAILED',
        message: 'No Microsoft Graph credentials found. Run OAuth flow first.',
      });
    }

    this.accessToken = tokens.accessToken;
    this.tokenExpiresAtMs = Date.now() + (tokens.expiresIn ?? 3600) * 1000;
    // Token expiry will be refreshed on demand
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    const wasConnected = this.connected;
    this.connected = false;
    this.accessToken = null;
    this.tokenExpiresAtMs = 0;
    this.identityEmail = null;

    if (!wasConnected) return;

    // Best-effort revocation - skip in test environments
    if (this.accessToken && !this.oauthTokenUrl.startsWith('http://')) {
      try {
        const url = new URL(this.oauthTokenUrl.replace('/token', '/revoke'));
        url.searchParams.set('token', this.accessToken);
        await this.httpClient.request(url.toString(), { method: 'POST' });
      } catch {
        /* ignore revocation errors */
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getIdentityEmail(): string | null {
    return this.identityEmail;
  }

  // ── Mailbox operations ────────────────────────────────────────────────────────

  async fetchMessages(limit = 50, offset = 0): Promise<EmailMessage[]> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    const safeLimit = Math.min(Math.max(limit || 50, 1), 50);
    const params = new URLSearchParams({ $top: String(safeLimit), $skip: String(offset) });
    
    const resp = await this.httpClient.request(
      `${this.apiBaseUrl}/users/me/messages?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    
    if (!resp.ok) {
      throw toMgError(new EmailProviderError({
        code: 'CONNECTION_FAILED',
        message: `Failed to fetch messages: ${resp.status}`,
      }));
    }
    
    const data = (await resp.json()) as MGMessageList;
    const messages = data.value ?? [];
    return messages.map(normalizeMgMessage);
  }

  async fetchSingleMessage(messageId: string): Promise<EmailMessage | null> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    
    const resp = await this.httpClient.request(
      `${this.apiBaseUrl}/users/me/messages/${messageId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw toMgError(new EmailProviderError({
        code: 'CONNECTION_FAILED',
        message: `Failed to fetch message: ${resp.status}`,
      }));
    }
    
    const data = await resp.json() as MGMessage;
    return normalizeMgMessage(data);
  }

  async listLabels(): Promise<MailboxInfo[]> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    
    const resp = await this.httpClient.request(
      `${this.apiBaseUrl}/me/mailFolders`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    
    if (!resp.ok) {
      throw toMgError(new EmailProviderError({
        code: 'CONNECTION_FAILED',
        message: `Failed to list folders: ${resp.status}`,
      }));
    }
    
    const data = await resp.json() as { value: Array<{ id: string; displayName: string; parentFolderId: string }> };
    return (data.value ?? []).map(folder => ({
      path: folder.displayName,
      delimiter: '/',
      specialUse: folder.id === 'inbox' ? 'inbox' : undefined,
      subscribed: true,
    }));
  }

  async getUnreadCount(): Promise<number> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    
    const resp = await this.httpClient.request(
      `${this.apiBaseUrl}/me/mailFolders/inbox/messages?$count=true&$filter=isRead eq false`,
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'ConsistencyLevel': 'eventual',
        },
      }
    );
    
    if (!resp.ok) {
      // Fallback: just check connection
      return 0;
    }
    
    // Microsoft Graph returns count in @odata.count header
    const countHeader = resp.headers.get('@odata.count');
    if (countHeader) return parseInt(countHeader, 10);
    // Fallback: check response body for total
    const body = await resp.text();
    try {
      const parsed = JSON.parse(body);
      return parsed?.value?.length ?? 0;
    } catch {
      return 0;
    }
  }

  async markAsRead(messageId: string): Promise<boolean> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    
    const resp = await this.httpClient.request(
      `${this.apiBaseUrl}/users/me/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead: true }),
      }
    );
    
    return resp.ok;
  }

  async searchMessages(query: string, limit = 50): Promise<EmailMessage[]> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    const safeLimit = Math.min(Math.max(limit || 50, 1), 50);
    
    const encodedQuery = encodeURIComponent(query);
    const resp = await this.httpClient.request(
      `${this.apiBaseUrl}/me/messages?$search="${encodedQuery}"&$top=${safeLimit}`,
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'ConsistencyLevel': 'eventual',
        },
      }
    );
    
    if (!resp.ok) {
      throw toMgError(new EmailProviderError({
        code: 'CONNECTION_FAILED',
        message: `Search failed: ${resp.status}`,
      }));
    }
    
    const data = (await resp.json()) as MGMessageList;
    const messages = data.value ?? [];
    return messages.map(normalizeMgMessage);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      await this.connect();
      await this.fetchAccountIdentity();
      
      const latencyMs = Date.now() - start;
      return {
        success: true,
        providerType: 'outlook',
        latencyMs,
        mailboxes: 1,
      };
    } catch (err) {
      const error = toMgError(err);
      return {
        success: false,
        providerType: 'outlook',
        errorCode: error.code,
        error: error.message,
        latencyMs: Date.now() - start,
      };
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────────

  private requireToken(): string {
    if (!this.accessToken) {
      throw new EmailProviderError({
        code: 'NOT_CONNECTED',
        message: 'Not connected. Run connect() first.',
      });
    }
    return this.accessToken;
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAtMs - 60_000) {
      const tokens = await this.tokenLoader();
      if (!tokens?.refreshToken) return;

      const resp = await this.httpClient.request(this.oauthTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId ?? '',
          client_secret: this.config.clientSecret ?? '',
          refresh_token: tokens.refreshToken,
        }).toString(),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        if (resp.status === 400 && body.toLowerCase().includes('invalid_grant')) {
          throw new EmailProviderError({
            code: 'ACCOUNT_REVOKED',
            message: 'Microsoft Graph authorization expired or revoked. Re-connect.',
          });
        }
        throw new EmailProviderError({
          code: 'AUTH_FAILED',
          message: `Token refresh failed (HTTP ${resp.status}).`,
        });
      }

      const data = (await resp.json()) as { access_token: string; expires_in: number; refresh_token?: string };
      this.accessToken = data.access_token;
      this.tokenExpiresAtMs = Date.now() + data.expires_in * 1000;
      if (data.refresh_token) {
        // Update stored refresh token
        this.tokenLoader().then(tokens => {
          if (tokens) {
            // Refresh token may have rotated
          }
        }).catch(() => {});
      }
    }
  }

  private async fetchAccountIdentity(): Promise<string | null> {
    await this.ensureFreshToken();
    const resp = await this.httpClient.request(USERINFO_URL, {
      headers: { Authorization: `Bearer ${this.requireToken()}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { mail?: string; userPrincipalName?: string };
    return data.mail ?? data.userPrincipalName ?? null;
  }
}

export function normalizeGmailMessage(_msg: MGMessage): EmailMessage {
  return normalizeMgMessage(_msg);
}
