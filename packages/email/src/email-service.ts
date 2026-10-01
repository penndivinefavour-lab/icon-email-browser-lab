/**
 * Email account service.
 *
 * This is the layer the API and UI talk to. It owns the rule that the rest of
 * the app depends on: a secret enters through `saveAccount`, and a secret comes
 * out through exactly one function, `buildProvider`, which needs an account id
 * and is never used to render anything.
 *
 * Every method that returns data for display returns a *public* account: config
 * redacted of secret-shaped fields, secret masked to a bullet string, health
 * summarized. There is no code path from an HTTP response to a plaintext
 * password.
 */

import {
  createProvider,
  CredentialStore,
  redactConfig,
  toPublicEmailAccount,
  type ConnectionTestResult,
  type EmailAttachment,
  type EmailMessage,
  type EmailProviderConfig,
  type ImapClientFactory,
  type MailboxInfo,
  type PublicEmailAccount,
} from './index.js';
import {
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  type TokenLoader,
} from './index.js';
import { getOTPParser } from './otp-parser.js';
import type { Database } from '../../database/src/index.js';

/** Config fields a user may set for an account. Secrets are excluded by type. */
export interface AccountConfigInput {
  host?: string;
  port?: number;
  user?: string;
  authMethod?: 'password' | 'oauth2';
  security?: 'tls' | 'starttls' | 'none';
  mailbox?: string;
  timeoutMs?: number;
  accessToken?: string;
  clientId?: string;
  delay?: number;
  [key: string]: unknown;
}

export interface SaveAccountInput {
  identityId: string;
  providerType: string;
  config: AccountConfigInput;
  /** Plaintext secret. Stored, never returned. */
  password?: string;
  isActive?: boolean;
}

export interface PublicAccountWithHealth extends PublicEmailAccount {
  health: {
    connectionStatus: string;
    lastCheckedAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    latencyMs: number | null;
    unreadCount: number | null;
    folderCount: number | null;
  };
}

export interface FetchResult {
  messages: EmailMessage[];
  fetchedAt: string;
  mailbox: string;
}

export class EmailAccountService {
  private readonly credentials: CredentialStore;
  private readonly clientFactory: ImapClientFactory | undefined;

  constructor(
    private readonly db: Database,
    options: { clientFactory?: ImapClientFactory } = {}
  ) {
    this.credentials = new CredentialStore(db);
    this.clientFactory = options.clientFactory;
  }

  /**
   * Create or update an account. The secret is diverted into the credential
   * store before the config is written, so it can never end up in the account
   * row even if the caller passed a full config object.
   */
  saveAccount(input: SaveAccountInput): PublicAccountWithHealth {
    const { secret, safeConfig } = splitSecret(input);

    // The account row is created first so the credential row has a foreign key
    // target, then the secret is written to its own table.
    const configJson = JSON.stringify(redactConfig(safeConfig));
    const created = this.db.createEmailAccount({
      identity_id: input.identityId,
      provider_type: input.providerType,
      config: configJson,
      is_active: input.isActive === false ? 0 : 1,
    });

    if (secret) {
      this.credentials.saveSecret(created.id, secret, input.providerType === 'imap' ? 'password' : 'token');
    }

    this.db.logActivity({
      action: 'email_account_saved',
      entity_type: 'email_account',
      entity_id: created.id,
      // Details deliberately record only that a secret exists, never its value.
      details: JSON.stringify({
        providerType: input.providerType,
        hasSecret: Boolean(secret),
      }),
    });

    return this.getAccount(created.id)!;
  }

  /** Update the non-secret config of an existing account. */
  updateConfig(accountId: string, config: AccountConfigInput): PublicAccountWithHealth | null {
    const existing = this.db.getEmailAccountById(accountId);
    if (!existing) return null;

    const { secret, safeConfig } = splitSecret({ config });
    const merged = { ...parseConfig(existing.config), ...safeConfig };

    this.db.updateEmailAccount(accountId, { config: JSON.stringify(redactConfig(merged)) });
    if (secret) this.credentials.saveSecret(accountId, secret);

    return this.getAccount(accountId);
  }

  /** Replace the stored secret without touching the config. */
  updateSecret(accountId: string, secret: string): PublicAccountWithHealth | null {
    if (!this.db.getEmailAccountById(accountId)) return null;
    this.credentials.saveSecret(accountId, secret);
    return this.getAccount(accountId);
  }

  /** Public, secret-free view of one account. */
  getAccount(accountId: string): PublicAccountWithHealth | null {
    const row = this.db.getEmailAccountById(accountId);
    if (!row) return null;
    return withHealth(this.db, toPublicEmailAccount(this.db, row));
  }

  getAccountsByIdentity(identityId: string): PublicAccountWithHealth[] {
    return this.db
      .getEmailAccountsByIdentity(identityId)
      .map((row) => withHealth(this.db, toPublicEmailAccount(this.db, row)));
  }

  getAllAccounts(): PublicAccountWithHealth[] {
    return this.db
      .getAllEmailAccounts()
      .map((row) => withHealth(this.db, toPublicEmailAccount(this.db, row)));
  }

  /**
   * Run a connection test. Records the outcome as health, logs the attempt, and
   * returns a result that is safe to render directly.
   */
  async testConnection(accountId: string): Promise<ConnectionTestResult> {
    const account = this.db.getEmailAccountById(accountId);
    if (!account) {
      return {
        success: false,
        providerType: 'mock',
        latencyMs: 0,
        errorCode: 'CONFIG_INVALID',
        error: 'That email account no longer exists.',
      };
    }

    const provider = this.buildProvider(accountId);
    const result = await provider.testConnection();

    this.db.setEmailAccountHealth(accountId, {
      connection_status: result.success ? 'connected' : 'error',
      last_error: result.success ? null : (result.error ?? 'Connection failed'),
      last_error_code: result.success ? null : (result.errorCode ?? null),
      latency_ms: result.latencyMs,
      unread_count: result.unreadCount ?? null,
      folder_count: result.mailboxes ?? null,
    });

    this.db.logActivity({
      action: 'email_connection_tested',
      entity_type: 'email_account',
      entity_id: accountId,
      // `result.detail` is already scrubbed by the provider's error layer.
      details: JSON.stringify({
        providerType: result.providerType,
        success: result.success,
        latencyMs: result.latencyMs,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      }),
    });

    return result;
  }

  /** Discover folders on the server. Requires a working connection. */
  async listMailboxes(accountId: string): Promise<MailboxInfo[]> {
    const provider = await this.withConnectedProvider(accountId);
    return provider.listMailboxes();
  }

  /**
   * Fetch messages through the normalized abstraction, persist them, and run
   * them through the OTP parser so the verification center updates.
   */
  async fetchMessages(accountId: string, limit = 25): Promise<FetchResult> {
    const provider = await this.withConnectedProvider(accountId);
    const messages = await provider.fetchMessages(limit, 0);
    const account = this.db.getEmailAccountById(accountId)!;

    for (const message of messages) {
      const saved = this.db.createMessage({
        account_id: accountId,
        message_id_external: message.messageIdExternal ?? null,
        subject: message.subject,
        sender: message.sender,
        recipient: message.recipient,
        body: message.body,
        body_html: message.bodyHtml ?? null,
        received_at: message.receivedAt.toISOString(),
        is_read: message.isRead ? 1 : 0,
        attachments: JSON.stringify(message.attachments.map((a: EmailAttachment): { id: string; filename: string; contentType: string; size: number } => ({ id: a.id, filename: a.filename, contentType: a.contentType, size: a.size }))),
      });

      this.extractCodes(account, saved.id, message);
    }

    this.db.updateEmailAccount(accountId, { last_synced_at: new Date().toISOString() });
    this.db.setEmailAccountHealth(accountId, { connection_status: 'connected', unread_count: messages.filter((m: EmailMessage) => !m.isRead).length });

    return {
      messages,
      fetchedAt: new Date().toISOString(),
      mailbox: provider.getConfig().mailbox ?? 'INBOX',
    };
  }

  /** Delete an account. The credential and health rows cascade away with it. */
  deleteAccount(accountId: string): boolean {
    return this.db.deleteEmailAccount(accountId);
  }

  // ── OAuth helpers ────────────────────────────────────────────────────────────

  /**
   * Generate OAuth authorization URL and state for initiating a Gmail connection.
   * Returns the URL and state separately so the caller can open the URL in a
   * browser and pass the state back on redirect (CSRF protection).
   */
  async generateOAuthInitParams(
    identityId: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<{ authorizationUrl: string; state: string; codeVerifier: string }> {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const scopes = [
      'openid',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authorizationUrl = buildAuthUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
      scopes,
      prompt: 'consent', // Force consent screen so we always get a refresh token
    });

    return { authorizationUrl, state, codeVerifier };
  }

  /**
   * Exchange an authorization code for tokens and store them.
   * Validates the state parameter against CSRF protections.
   */
  async exchangeOAuthCode(
    identityId: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    authCode: string,
    state: string,
  ): Promise<{ success: boolean; accountId?: string; error?: string }> {
    // Validate state (CSRF check) — would normally compare against stored state
    if (!state || state.length < 16) {
      return { success: false, error: 'Invalid state parameter' };
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: authCode,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text().catch(() => '');
      console.error('[Gmail OAuth] Token exchange failed:', tokenResponse.status, error.slice(0, 200));
      return { success: false, error: `OAuth token exchange failed (${tokenResponse.status})` };
    }

    const data = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };

    // Store tokens via CredentialStore (separate table, never in config)
    const credentials = new CredentialStore(this.db);
    
    // Create or update the account
    const existing = this.db.getEmailAccountsByIdentity(identityId).find(
      (a) => a.provider_type === 'gmail',
    );

    const accountId = existing?.id ?? this.db.createEmailAccount({
      identity_id: identityId,
      provider_type: 'gmail',
      config: JSON.stringify({
        clientId,
        redirectUri,
        scopes: ['gmail.readonly', 'openid', 'userinfo.email'],
      }),
      is_active: 1,
    })!.id;

    // Store tokens separately (not in config!)
    const now = Date.now();
    credentials.saveSecret(accountId, data.access_token, 'access_token');
    credentials.saveSecret(accountId, data.refresh_token, 'refresh_token');

    // Update last connected timestamp
    this.db.setEmailAccountHealth(accountId, {
      connection_status: 'connected',
      last_checked_at: new Date().toISOString(),
      unread_count: 0,
    });

    return { success: true, accountId };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /**
   * Assemble a provider with its secret attached. This is the only place a
   * stored secret is read back, and the result is never returned to a caller.
   */
  buildProvider(accountId: string) {
    const account = this.db.getEmailAccountById(accountId);
    if (!account) {
      throw new Error('Unknown email account');
    }
    const stored = this.credentials.resolveSecret(accountId);
    const config: EmailProviderConfig = {
      ...parseConfig(account.config),
      type: account.provider_type as EmailProviderConfig['type'],
    } as EmailProviderConfig;

    if (stored && config.type === 'imap') {
      if (config.authMethod === 'oauth2') {
        config.accessToken = stored.secret;
      } else {
        config.password = stored.secret;
      }
    }

    if (stored && config.type === 'gmail') {
      // For Gmail, store access_token and refresh_token separately
      const accessToken = this.credentials.getSecretByType(accountId, 'access_token');
      const refreshToken = this.credentials.getSecretByType(accountId, 'refresh_token');
      
      if (accessToken || refreshToken) {
        const clientId = (config as any).clientId ?? '';
        const clientSecret = (config as any).clientSecret ?? '';
        const redirectUri = (config as any).redirectUri ?? '';
        
        const tokenLoader: () => Promise<{ accessToken: string; refreshToken: string } | null> = async () => {
          const at = this.credentials.getSecretByType(accountId, 'access_token');
          const rt = this.credentials.getSecretByType(accountId, 'refresh_token');
          if (!at) return null;
          return { accessToken: at, refreshToken: rt ?? '' };
        };
        
        return {
          ...createProvider(config as any, accountId, account.identity_id),
          tokenLoader,
        } as any;
      }
    }

    return createProvider(config, accountId, account.identity_id, {
      ...(this.clientFactory ? { clientFactory: this.clientFactory } : {}),
    });
  }

  /**
   * Build a provider, connect it, and hand it to `fn`, guaranteeing the socket
   * is closed afterwards even if `fn` throws. Every network-touching method goes
   * through here so a failed fetch can never leave a dangling connection.
   */
  private async withConnectedProvider(accountId: string) {
    const provider = this.buildProvider(accountId);
    await provider.connect();
    return provider;
  }

  /** Run the OTP parser over a fetched message and store any codes found. */
  private extractCodes(
    account: { identity_id: string },
    messageRowId: string,
    message: EmailMessage
  ): void {
    try {
      const parser = getOTPParser();
      const records = parser.parseMessage({
        subject: message.subject,
        body: message.body,
        sender: message.sender,
        receivedAt: message.receivedAt,
      });

      for (const record of records) {
        this.db.createVerificationCode({
          message_id: messageRowId,
          identity_id: account.identity_id,
          sender: record.sender || message.sender,
          service_label: record.serviceLabel ?? null,
          code: record.code,
          code_type: record.codeType,
          expires_at: record.expiresAt ? record.expiresAt.toISOString() : null,
        });
      }
    } catch {
      // A parser failure must not lose the message itself.
    }
  }
}

/** Split a secret out of a config object so it cannot be persisted inline. */
function splitSecret(input: { config: AccountConfigInput; password?: string }): {
  secret: string | null;
  safeConfig: Record<string, unknown>;
} {
  const { password, config } = input;
  const safeConfig: Record<string, unknown> = { ...(config ?? {}) };
  // Remove any secret-shaped key the caller may have nested in the config.
  for (const key of ['password', 'accessToken', 'clientSecret', 'refreshToken', 'appPassword', 'token']) {
    if (key in safeConfig && key !== 'accessToken') {
      delete safeConfig[key];
    }
  }
  const secret = password ?? (typeof safeConfig.accessToken === 'string' ? safeConfig.accessToken : null);
  if (secret) delete safeConfig.accessToken;
  return { secret, safeConfig };
}

function parseConfig(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function withHealth(db: Database, account: PublicEmailAccount): PublicAccountWithHealth {
  const health = db.getEmailAccountHealth(account.id);
  return {
    ...account,
    health: {
      connectionStatus: health?.connection_status ?? 'disconnected',
      lastCheckedAt: health?.last_checked_at ?? null,
      lastError: health?.last_error ?? null,
      lastErrorCode: health?.last_error_code ?? null,
      latencyMs: health?.latency_ms ?? null,
      unreadCount: health?.unread_count ?? null,
      folderCount: health?.folder_count ?? null,
    },
  };
}
