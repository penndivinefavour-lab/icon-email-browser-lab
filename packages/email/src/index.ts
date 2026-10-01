/**
 * Email Provider Abstraction Layer
 *
 * Public surface of the email package. The shared types and the abstract
 * `EmailProvider` live in `types.ts`, the MockProvider and the provider factory
 * live here, and the IMAP adapter lives in `imap-provider.ts`.
 *
 * `MockEmailProvider` remains the default development and test path: it is
 * selected whenever an account's provider type is `mock`, and no real network
 * call happens unless an account is explicitly configured for a real provider.
 */

// ── Shared provider types ───────────────────────────────────────────────
export type {
  EmailProviderConfig,
  EmailProviderType,
  ImapAuthMethod,
  ImapSecurity,
  EmailMessage,
  EmailAttachment,
  EmailAccountConnection,
  MailboxInfo,
  ConnectionTestResult,
  ProviderStatus,
} from './types.js';
export { EmailProvider, describeError } from './types.js';

// ── Structured errors ───────────────────────────────────────────────────
export {
  EmailProviderError,
  classifyProviderError,
  scrubSecrets,
  oauthUserFacingMessage,
  type EmailProviderErrorCode,
} from './errors.js';

// ── Credential storage ──────────────────────────────────────────────────
export {
  CredentialStore,
  toPublicEmailAccount,
  redactConfig,
  maskConfig,
  maskSecret,
  SECRET_FIELDS,
  type StoredCredentials,
  type ResolvedCredentials,
  type PublicEmailAccount,
  type SecretField,
} from './credentials.js';

// ── IMAP provider ───────────────────────────────────────────────────────
export {
  ImapProvider,
  normalizeImapMessage,
  type ImapProviderOptions,
  type ImapClientLike,
  type ImapClientFactory,
  type ImapFetchedMessage,
} from './imap-provider.js';

// ── Gmail provider ───────────────────────────────────────────────────────
export {
  GmailProvider,
  normalizeGmailMessage,
  type GmailProviderConfig,
  type GmailProviderOptions,
  type TokenLoader,
  type GmailHttpClient,
} from './gmail-provider.js';

// ── Fake test helpers ───────────────────────────────────────────────────
export {
  createFakeGoogleServer,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  type FakeTokenData,
  type FakeServerOptions,
} from './testing/fake-google-server.js';

// ── Outlook provider placeholder ────────────────────────────────────────
export { OutlookProvider } from './outlook-provider-placeholder.js';

import {
  EmailProvider,
  type EmailMessage,
  type EmailProviderConfig,
  type MailboxInfo,
} from './types.js';
import { ImapProvider, type ImapClientFactory } from './imap-provider.js';
import { GmailProvider, type TokenLoader } from './gmail-provider.js';
import { OutlookProvider } from './outlook-provider-placeholder.js';

/**
 * Mock provider. Used by default for development, seeded data, and every
 * automated test. It performs no I/O and is the only provider the UI bundle
 * needs at runtime.
 */
export class MockEmailProvider extends EmailProvider {
  private messages: EmailMessage[] = [];
  private messageCounter = 0;

  constructor(config: EmailProviderConfig, accountId: string, identityId: string) {
    super(config, accountId, identityId);
    // Pre-populate with some demo messages if delay is set
    if (config.delay && config.delay > 0) {
      this.generateDemoMessages();
    }
  }

  private generateDemoMessages(): void {
    const demoMessages: Omit<EmailMessage, 'id'>[] = [
      {
        messageIdExternal: 'demo-001',
        subject: 'Your verification code for ICON Lab',
        sender: 'noreply@example.test',
        recipient: 'demo@example.test',
        body: 'Your verification code is: 847291. This code expires in 10 minutes.',
        bodyHtml: '<p>Your verification code is: <strong>847291</strong>. This code expires in 10 minutes.</p>',
        receivedAt: new Date(Date.now() - 1000 * 60 * 2),
        isRead: false,
        attachments: [],
      },
      {
        messageIdExternal: 'demo-002',
        subject: 'Welcome to ICON Email Browser Lab',
        sender: 'hello@icon-studios.test',
        recipient: 'demo@example.test',
        body: 'Welcome! Your account has been created successfully. Start by setting up your profile.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 30),
        isRead: true,
        attachments: [],
      },
      {
        messageIdExternal: 'demo-003',
        subject: 'OTP: Login Verification',
        sender: 'auth@app.test',
        recipient: 'demo@example.test',
        body: 'Login code: 392847. Do not share this code with anyone.',
        bodyHtml: '<p>Login code: <strong>392847</strong>. Do not share this code with anyone.</p>',
        receivedAt: new Date(Date.now() - 1000 * 60 * 5),
        isRead: false,
        attachments: [],
      },
    ];

    for (const msg of demoMessages) {
      this.messages.push({
        ...msg,
        id: `mock-${++this.messageCounter}`,
      });
    }
  }

  async connect(): Promise<boolean> {
    // Simulate connection delay
    const delay = this.config.delay || 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.messages = [];
  }

  async fetchMessages(limit = 50, offset = 0): Promise<EmailMessage[]> {
    const sorted = [...this.messages].sort((a, b) =>
      b.receivedAt.getTime() - a.receivedAt.getTime()
    );
    return sorted.slice(offset, offset + limit);
  }

  async searchMessages(query: string): Promise<EmailMessage[]> {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(lowerQuery) ||
        m.sender.toLowerCase().includes(lowerQuery) ||
        m.body.toLowerCase().includes(lowerQuery)
    );
  }

  async markAsRead(messageId: string): Promise<boolean> {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.isRead = true;
      return true;
    }
    return false;
  }

  async getUnreadCount(): Promise<number> {
    return this.messages.filter((m) => !m.isRead).length;
  }

  /**
   * Single-folder view. The Mock provider is inbox-only, so it reports the one
   * folder it serves rather than pretending to be a real server.
   */
  override async listMailboxes(): Promise<MailboxInfo[]> {
    return [{ path: this.config.mailbox || 'INBOX', delimiter: '.', subscribed: true }];
  }

  // Helper for adding test messages
  addMessage(message: Omit<EmailMessage, 'id'>): EmailMessage {
    const id = `mock-${++this.messageCounter}`;
    const msg: EmailMessage = {
      ...message,
      id,
    };
    this.messages.push(msg);
    return msg;
  }

  clearMessages(): void {
    this.messages = [];
    this.messageCounter = 0;
  }
}

/** Extra construction options, currently only used to inject a fake client. */
export interface CreateProviderOptions {
  clientFactory?: ImapClientFactory;
  tokenLoader?: TokenLoader;
}

/**
 * Build a provider for an account. `mock` is the default so an unconfigured or
 * misconfigured account can never accidentally reach the network.
 */
export function createProvider(
  config: EmailProviderConfig,
  accountId: string,
  identityId: string,
  options: CreateProviderOptions = {}
): EmailProvider {
  switch (config.type) {
    case 'mock':
      return new MockEmailProvider(config, accountId, identityId);
    case 'imap':
      return new ImapProvider(config, accountId, identityId, {
        ...(options.clientFactory ? { clientFactory: options.clientFactory } : {}),
      });
    case 'gmail':
      return new GmailProvider(config as any, accountId, identityId, options.tokenLoader ?? (() => Promise.resolve(null)));
    case 'outlook':
      return new OutlookProvider(config, accountId, identityId);
    default:
      throw new Error(`Unknown provider type: ${(config.type as string)}`);
  }
}
