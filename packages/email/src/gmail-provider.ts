/**
 * Gmail provider using direct REST calls (no SDK).
 *
 * Follows the existing `EmailProvider` abstraction so the rest of the app stays
 * provider-agnostic. Uses the Google Gmail REST API v1 with simple HTTPS fetch.
 *
 * OAuth flow (server-side, PKCE):
 *   1. Client gets OAuth init URL from backend
 *   2. User authorizes → Google redirects back with auth code + state
 *   3. Backend validates state (CSRF), exchanges code for tokens
 *   4. Tokens stored in email_credentials table
 *   5. Provider loads tokens from DB via TokenLoader seam
 *
 * Scopes: openid + userinfo.email + gmail.readonly
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

// ── Types ───────────────────────────────────────────────────────────────────────

export interface GmailProviderConfig extends EmailProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface GmailProviderOptions {
  /** Override for testing; defaults to real fetch(). */
  httpClient?: GmailHttpClient;
  /** Override base URL for tests. */
  apiBaseUrl?: string;
}

export interface GmailHttpClient {
  request(url: string, options: RequestInit): Promise<Response>;
}

export type TokenLoader = () => Promise<{ accessToken: string; refreshToken: string } | null>;

interface GHeader { name: string; value: string; }
interface GPart { partId: string; mimeType: string; filename: string; headers: GHeader[]; body: { size?: number; data?: string }; parts?: GPart[]; }
interface GPayload { headers: GHeader[]; mimeType: string; parts?: GPart[]; }
interface GMessage { id: string; threadId: string; labelIds: string[]; snippet: string; payload: GPayload; internalDate: string; }

// ── Constants ────────────────────────────────────────────────────────────────────

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const DEFAULT_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const MAX_BODY_CHARS = 20_000;

// ── Helpers ────────────────────────────────────────────────────────────────────────

function extractHeaderValue(headers: GHeader[], name: string): string {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return decodeURIComponent(
    Array.from(atob(base64))
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

function extractTextBody(parts: GPart[] | undefined, mimeType: string): string {
  if (!parts) return '';
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      try {
        return base64UrlDecode(part.body.data).slice(0, MAX_BODY_CHARS);
      } catch {
        return '';
      }
    }
    if (part.parts) {
      const nested = extractTextBody(part.parts, mimeType);
      if (nested) return nested;
    }
  }
  return '';
}

function extractAttachments(parts: GPart[] | undefined): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];
  if (!parts) return attachments;
  for (const part of parts) {
    if (part.body?.data && part.filename) {
      attachments.push({
        id: `gmail-att-${part.partId}`,
        filename: part.filename,
        contentType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        content: part.body.data,
      });
    }
    if (part.parts) {
      attachments.push(...extractAttachments(part.parts));
    }
  }
  return attachments;
}

function toGmailError(err: unknown): EmailProviderError {
  if (err instanceof EmailProviderError) return err;
  const e = err as { message?: string; code?: string } | null;
  const msg = e?.message ?? String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('invalid_grant') || lower.includes('unauthorized_client') || lower.includes('invalid_client')) {
    return new EmailProviderError({ code: 'OAUTH_FAILED', message: 'Authorization failed. Re-connect your Gmail account.' });
  }
  if (lower.includes('quota') || lower.includes('rate limit')) {
    return new EmailProviderError({ code: 'RATE_LIMITED', message: 'Gmail API rate limit exceeded. Try again shortly.' });
  }
  return classifyProviderError(err, []);
}

// ── Provider ──────────────────────────────────────────────────────────────────────

export class GmailProvider extends EmailProvider {
  protected readonly config: GmailProviderConfig;
  protected readonly accountId: string;
  protected readonly identityId: string;
  private readonly tokenLoader: TokenLoader;
  private readonly httpClient: GmailHttpClient;
  private readonly apiBaseUrl: string;
  
  // Runtime state
  private accessToken: string | null = null;
  private tokenExpiresAtMs = 0;
  private connected = false;
  private identityEmail: string | null = null;

  constructor(
    config: GmailProviderConfig,
    accountId: string,
    identityId: string,
    tokenLoader: TokenLoader,
    options: GmailProviderOptions = {},
  ) {
    super(config as EmailProviderConfig, accountId, identityId);
    this.config = config;
    this.accountId = accountId;
    this.identityId = identityId;
    this.tokenLoader = tokenLoader;
    this.httpClient = options.httpClient ?? (globalThis as any);
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE;
  }

  getType(): 'gmail' {
    return 'gmail';
  }

  getConfig(): GmailProviderConfig {
    return this.config;
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    const tokens = await this.tokenLoader();
    if (!tokens) {
      throw new EmailProviderError({
        code: 'AUTH_FAILED',
        message: 'No Gmail credentials found. Connect your account first.',
      });
    }

    this.accessToken = tokens.accessToken;
    this.tokenExpiresAtMs = Date.now() + 3600_000; // Default 1h expiry
    this.connected = true;

    // Discover identity non-blocking
    this.fetchAccountIdentity().catch(() => null);

    return true;
  }

  async disconnect(): Promise<void> {
    const wasConnected = this.connected;
    this.connected = false;
    this.accessToken = null;
    this.tokenExpiresAtMs = 0;
    this.identityEmail = null;

    if (!wasConnected) return;

    // Best-effort revocation
    if (this.accessToken) {
      try {
        const url = new URL(OAUTH_REVOKE_URL);
        url.searchParams.set('token', this.accessToken);
        await this.httpClient.request(url.toString(), { method: 'POST' });
      } catch {
        /* ignore */
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getIdentityEmail(): string | null {
    return this.identityEmail;
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

      const resp = await this.httpClient.request(OAUTH_TOKEN_URL, {
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
            message: 'Gmail authorization expired or revoked. Re-connect.',
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
    }
  }

  private async fetchAccountIdentity(): Promise<string | null> {
    await this.ensureFreshToken();
    const resp = await this.httpClient.request(USERINFO_URL, {
      headers: { Authorization: `Bearer ${this.requireToken()}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { email?: string };
    return data.email ?? null;
  }

  private mapApiError(context: string, resp: Response): EmailProviderError {
    const status = resp.status;
    if (status === 401 || status === 403) {
      return new EmailProviderError({
        code: 'AUTH_FAILED',
        message: `Gmail auth failed (${context}). Re-connect.`,
      });
    }
    if (status === 429) {
      return new EmailProviderError({
        code: 'RATE_LIMITED',
        message: 'Gmail API rate limit exceeded.',
      });
    }
    if (status >= 500) {
      return new EmailProviderError({
        code: 'AUTH_FAILED',
        message: `Gmail API server error (${context}).`,
      });
    }
    return new EmailProviderError({
      code: 'UNKNOWN',
      message: `${context}: HTTP ${status}`,
    });
    return new EmailProviderError({
      code: 'UNKNOWN',
      message: `${context}: HTTP ${status}`,
    });
  }

  // ── EmailProvider implementation ───────────────────────────────────────────────

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.connect();
      await this.fetchProfile();
      return {
        success: true,
        providerType: 'gmail',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        success: false,
        providerType: 'gmail',
        latencyMs: Date.now() - started,
        ...describeError(err),
      };
    }
  }

  async fetchProfile(): Promise<{ emailAddress: string }> {
    await this.connect();
    await this.ensureFreshToken();
    const email = await this.fetchAccountIdentity();
    if (!email) throw new EmailProviderError({
      code: 'AUTH_FAILED',
      message: 'Could not retrieve Gmail account identity.',
    });
    this.identityEmail = email;
    return { emailAddress: email };
  }

  async fetchMessages(limit = 50, _offset = 0): Promise<EmailMessage[]> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();
    const safeLimit = Math.min(limit ?? 50, 500);
    const params = new URLSearchParams({ maxResults: String(safeLimit) });

    const resp = await this.httpClient.request(`${this.apiBaseUrl}/users/me/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw this.mapApiError('messages.list', resp);
    
    const data = await resp.json() as { messages?: Array<{ id: string }> };
    const ids = data.messages ?? [];
    const results: EmailMessage[] = [];
    
    for (const m of ids.slice(0, safeLimit)) {
      try {
        const full = await this.fetchSingleMessage(m.id);
        if (full) results.push(full);
      } catch { /* skip individual failures */ }
    }
    return results;
  }

  async fetchSingleMessage(messageId: string): Promise<EmailMessage | null> {
    await this.connect();
    await this.ensureFreshToken();
    const token = this.requireToken();

    const resp = await this.httpClient.request(`${this.apiBaseUrl}/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw this.mapApiError(`messages.get(${messageId})`, resp);
    }
    const raw = (await resp.json()) as Record<string, unknown>;
    return normalizeGmailMessage(raw);
  }

  async searchMessages(query: string): Promise<EmailMessage[]> {
    await this.connect();
    await this.ensureFreshToken();
    const safeLimit = 50;
    const params = new URLSearchParams({ q: query, maxResults: String(safeLimit) });

    const resp = await this.httpClient.request(`${this.apiBaseUrl}/users/me/messages?${params}`, {
      headers: { Authorization: `Bearer ${this.requireToken()}` },
    });
    if (!resp.ok) throw this.mapApiError('messages.search', resp);
    
    const data = await resp.json() as { messages?: Array<{ id: string }> };
    const ids = data.messages ?? [];
    const results: EmailMessage[] = [];
    
    for (const m of ids.slice(0, safeLimit)) {
      const msg = await this.fetchSingleMessage(m.id);
      if (msg) results.push(msg);
    }
    return results;
  }

  async getUnreadCount(): Promise<number> {
    await this.connect();
    await this.ensureFreshToken();
    const resp = await this.httpClient.request(`${this.apiBaseUrl}/users/me/labels/label.UNREAD/numMessages`, {
      headers: { Authorization: `Bearer ${this.requireToken()}` },
    });
    if (!resp.ok) return 0;
    const data = await resp.json() as { total?: number };
    return data.total ?? 0;
  }

  async listMailboxes(): Promise<MailboxInfo[]> {
    await this.connect();
    await this.ensureFreshToken();
    const resp = await this.httpClient.request(`${this.apiBaseUrl}/users/me/labels`, {
      headers: { Authorization: `Bearer ${this.requireToken()}` },
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { labels?: Array<{ id: string; name: string; type: string }> };
    return (data.labels ?? []).map((l) => ({
      path: l.name,
      delimiter: '/',
      subscribed: true,
    }));
  }

  async markAsRead(messageId: string): Promise<boolean> {
    await this.connect();
    await this.ensureFreshToken();
    const resp = await this.httpClient.request(`${this.apiBaseUrl}/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.requireToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
    return resp.ok;
  }
}

// ── Normalization ──────────────────────────────────────────────────────────────────

export function normalizeGmailMessage(raw: Record<string, unknown>): EmailMessage {
  const msg = raw as unknown as GMessage;
  const headers = msg.payload?.headers ?? [];
  const parts = msg.payload?.parts;

  const dateStr = extractHeaderValue(headers, 'date');
  const receivedAt = dateStr ? new Date(dateStr) : new Date(parseInt(msg.internalDate) ?? 0);
  if (Number.isNaN(receivedAt.getTime())) receivedAt.setTime(Date.now());

  const isRead = !(msg.labelIds?.includes('UNREAD') ?? true);
  const subject = extractHeaderValue(headers, 'subject') || '(no subject)';
  const from = extractHeaderValue(headers, 'from');
  const to = extractHeaderValue(headers, 'to');

  const textBody = extractTextBody(parts, 'text/plain');
  const htmlBody = extractTextBody(parts, 'text/html');
  const attachments = extractAttachments(parts);

  return {
    id: `gmail-${msg.id}`,
    messageIdExternal: msg.id,
    subject,
    sender: from || '(unknown)',
    recipient: to || '(unknown)',
    body: textBody || htmlBody || msg.snippet || '',
    bodyHtml: htmlBody || undefined,
    receivedAt,
    isRead,
    attachments,
    rawHeaders: headers.map((h) => `${h.name}: ${h.value}`).join('\n'),
  };
}
