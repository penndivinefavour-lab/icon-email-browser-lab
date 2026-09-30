/**
 * Email provider types shared by every adapter.
 *
 * The abstract `EmailProvider` is the contract the rest of the application
 * already depends on. Phase 6a keeps every existing abstract method intact and
 * adds three capability methods with default implementations, so a provider that
 * does not support them (MockEmailProvider) still satisfies the interface.
 */

import type { EmailProviderErrorCode } from './errors.js';

export type EmailProviderType = 'mock' | 'imap' | 'gmail' | 'outlook';

/**
 * Authentication methods imapflow supports for authorized mailboxes.
 * `password` = SASL PLAIN/LOGIN, `oauth2` = XOAUTH2/OAUTHBEARER bearer token.
 */
export type ImapAuthMethod = 'password' | 'oauth2';

/** TLS posture. `none` is only appropriate for a local test server. */
export type ImapSecurity = 'tls' | 'starttls' | 'none';

export interface EmailProviderConfig {
  type: EmailProviderType;
  host?: string;
  port?: number;
  user?: string;
  /** Never persisted into the ordinary account record; see the credential store. */
  password?: string;
  /** Bearer access token when `authMethod` is `oauth2`. Also never persisted inline. */
  accessToken?: string;
  authMethod?: ImapAuthMethod;
  security?: ImapSecurity;
  /** Folder to read. Defaults to INBOX. */
  mailbox?: string;
  /** Connection budget in ms. Defaults to 15000. */
  timeoutMs?: number;
  clientId?: string;
  clientSecret?: string;
  delay?: number; // Simulated delay for mock
}

export interface EmailMessage {
  id: string;
  messageIdExternal?: string;
  subject: string;
  sender: string;
  recipient: string;
  body: string;
  bodyHtml?: string;
  receivedAt: Date;
  isRead: boolean;
  attachments: EmailAttachment[];
  rawHeaders?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content?: string;
}

export interface EmailAccountConnection {
  accountId: string;
  identityId: string;
  providerType: string;
  config: EmailProviderConfig;
  isActive: boolean;
}

/** A folder discovered on the server. */
export interface MailboxInfo {
  path: string;
  delimiter: string;
  specialUse?: string;
  subscribed: boolean;
}

/** Safe, renderable outcome of a connection test. Carries no secrets. */
export interface ConnectionTestResult {
  success: boolean;
  providerType: EmailProviderType;
  latencyMs: number;
  mailboxes?: number;
  unreadCount?: number;
  /** Present only on failure. */
  errorCode?: EmailProviderErrorCode;
  error?: string;
  /** Scrubbed diagnostic text, safe to show in a details panel. */
  detail?: string;
}

/** Health/status of a configured account, persisted as safe fields only. */
export interface ProviderStatus {
  connectionStatus: 'connected' | 'disconnected' | 'error' | 'testing';
  lastError?: string;
  lastErrorCode?: EmailProviderErrorCode;
  lastCheckedAt?: string;
  latencyMs?: number;
  unreadCount?: number;
}

export abstract class EmailProvider {
  protected config: EmailProviderConfig;
  protected accountId: string;
  protected identityId: string;

  constructor(config: EmailProviderConfig, accountId: string, identityId: string) {
    this.config = config;
    this.accountId = accountId;
    this.identityId = identityId;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]>;
  abstract searchMessages(query: string): Promise<EmailMessage[]>;
  abstract markAsRead(messageId: string): Promise<boolean>;
  abstract getUnreadCount(): Promise<number>;

  /**
   * Connect, probe, and disconnect. Never throws: failures are reported as a
   * result so the UI can render them without a try/catch.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.connect();
      const unread = await this.getUnreadCount();
      return {
        success: true,
        providerType: this.config.type,
        latencyMs: Date.now() - started,
        unreadCount: unread,
      };
    } catch (err) {
      return {
        success: false,
        providerType: this.config.type,
        latencyMs: Date.now() - started,
        ...describeError(err),
      };
    }
  }

  /** Folder discovery. Providers without support report an empty list. */
  async listMailboxes(): Promise<MailboxInfo[]> {
    return [];
  }

  getConfig(): EmailProviderConfig {
    return this.config;
  }
}

/** Flatten an error into the safe fields used by `ConnectionTestResult`. */
export function describeError(err: unknown): {
  errorCode?: EmailProviderErrorCode;
  error?: string;
  detail?: string;
} {
  if (err && typeof err === 'object') {
    const e = err as { code?: EmailProviderErrorCode; message?: string; detail?: string };
    return {
      ...(e.code ? { errorCode: e.code } : {}),
      ...(e.message ? { error: e.message } : {}),
      ...(e.detail ? { detail: e.detail } : {}),
    };
  }
  return { error: 'Unknown provider error' };
}
