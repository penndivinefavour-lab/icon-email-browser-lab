/**
 * Generic IMAP provider, built on imapflow 2.x.
 *
 * Scope: authorized mailboxes the operator controls. Point this at an IMAP
 * server, supply credentials for an account you own, and it reads that mailbox
 * through the same normalized `EmailMessage` shape every other provider uses.
 *
 * Why imapflow and not node-imap: node-imap's maintainer abandoned it in March
 * 2025; imapflow is the actively maintained successor used in production by
 * EmailEngine.
 *
 * Testability: the constructor takes an optional `clientFactory`. Tests inject a
 * fake client, so the whole suite runs with no network, no mail server, and no
 * credentials. Nothing in this file reaches out on its own.
 */

import { EmailProvider, describeError, type ConnectionTestResult, type EmailMessage, type EmailProviderConfig, type EmailAttachment, type MailboxInfo } from './types.js';
import { EmailProviderError, classifyProviderError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAILBOX = 'INBOX';
/** Bodies are truncated before they reach the rest of the app or the database. */
const MAX_BODY_CHARS = 20_000;

/**
 * The subset of the imapflow client this provider uses. Declaring it keeps the
 * provider honest about the surface it depends on and makes faking it in tests a
 * structural guarantee rather than a guess.
 */
export interface ImapClientLike {
  connect(): Promise<unknown>;
  logout(): Promise<unknown>;
  close(): void;
  list(options?: unknown): Promise<ImapMailboxLike[]>;
  search(query: Record<string, unknown>): Promise<number[] | false | undefined>;
  status(path: string | string[], query: Record<string, unknown>): Promise<Record<string, number> | false>;
  fetch(
    range: string,
    query: Record<string, unknown>,
    options?: Record<string, unknown>
  ): AsyncGenerator<ImapFetchedMessage, false | void, undefined>;
  messageFlagsAdd(range: string, flags: string[], options?: Record<string, unknown>): Promise<boolean>;
  getMailboxLock(path: string | string[], options?: Record<string, unknown>): Promise<{ path: string; release(): void }>;
  mailboxOpen?(path: string | string[], options?: Record<string, unknown>): Promise<{ exists?: number }>;
}

/** The subset of imapflow's MailboxObject that folder discovery reads. */
export interface ImapMailboxLike {
  path: string;
  delimiter?: string;
  specialUse?: string;
  subscribed?: boolean;
  /** Folder flags, e.g. `\Noselect` for namespace markers. */
  flags?: Set<string>;
}

/** The subset of imapflow's FetchMessageObject that we normalise. */
export interface ImapFetchedMessage {
  uid?: number;
  seqnum?: number;
  internalDate?: Date | string;
  envelope?: {
    subject?: string;
    messageId?: string;
    date?: Date | string;
    from?: Array<{ name?: string; address?: string }>;
    sender?: Array<{ name?: string; address?: string }>;
    to?: Array<{ name?: string; address?: string }>;
    cc?: Array<{ name?: string; address?: string }>;
  };
  flags?: Set<string>;
  size?: number;
  headers?: Buffer;
  bodyParts?: Map<string, Buffer>;
  bodyStructure?: { childNodes?: unknown[]; contentType?: string };
}

export type ImapClientFactory = (options: Record<string, unknown>) => ImapClientLike;

/** Options accepted by {@link ImapProvider}. */
export interface ImapProviderOptions {
  /**
   * Injected in tests. Defaults to constructing a real imapflow client.
   */
  clientFactory?: ImapClientFactory;
}

export class ImapProvider extends EmailProvider {
  private client: ImapClientLike | null = null;
  private connected = false;
  private readonly clientFactory: ImapClientFactory | null;
  private readonly timeoutMs: number;
  private readonly mailbox: string;

  constructor(
    config: EmailProviderConfig,
    accountId: string,
    identityId: string,
    options: ImapProviderOptions = {}
  ) {
    super(config, accountId, identityId);
    this.clientFactory = options.clientFactory ?? null;
    this.timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.mailbox = config.mailbox?.trim() || DEFAULT_MAILBOX;
  }

  // ── Connection lifecycle ──────────────────────────────────────────────

  /**
   * Validate configuration before opening a socket, so a missing host is
   * reported as a fixable config error rather than a DNS failure.
   */
  private validateConfig(): void {
    const problems: string[] = [];
    if (!this.config.host?.trim()) problems.push('host is required');
    if (!this.config.user?.trim()) problems.push('user is required');

    const authMethod = this.config.authMethod ?? 'password';
    if (authMethod === 'password' && !this.config.password) {
      problems.push('a password (or app password) is required for password authentication');
    }
    if (authMethod === 'oauth2' && !this.config.accessToken) {
      problems.push('an access token is required for oauth2 authentication');
    }

    if (problems.length > 0) {
      throw new EmailProviderError({
        code: 'CONFIG_INVALID',
        message: `The account configuration is incomplete or invalid: ${problems.join('; ')}.`,
        detail: problems.join('; '),
      });
    }
  }

  /**
   * Values scrubbed out of any error text this provider surfaces. Includes the
   * account address alongside the password and token: a rejected login usually
   * echoes the address back, and it has no business appearing in a log line.
   */
  private secretValues(): (string | undefined)[] {
    return [this.config.password, this.config.accessToken, this.config.user];
  }

  /** Build the imapflow options. TLS posture is explicit, never inferred. */
  private buildClientOptions(): Record<string, unknown> {
    const security = this.config.security ?? 'tls';
    const port = this.config.port ?? (security === 'tls' ? 993 : 143);
    const authMethod = this.config.authMethod ?? 'password';

    const base: Record<string, unknown> = {
      host: this.config.host,
      port,
      secure: security !== 'none',
      logger: false,
      connectionTimeout: this.timeoutMs,
      greetingTimeout: this.timeoutMs,
      socketTimeout: this.timeoutMs,
    };

    if (security === 'none') {
      // Plaintext only reaches a loopback test server; refuse to do it over a
      // routable interface even if someone points this at a real host.
      const host = String(this.config.host ?? '');
      const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (!isLoopback) {
        throw new EmailProviderError({
          code: 'CONFIG_INVALID',
          message:
            'Unencrypted IMAP is only permitted against localhost. Use TLS or STARTTLS for a remote host.',
        });
      }
    }

    if (security === 'starttls') {
      base.secure = false;
    }

    if (authMethod === 'oauth2') {
      base.auth = { user: this.config.user, accessToken: this.config.accessToken };
    } else {
      base.auth = { user: this.config.user, pass: this.config.password };
    }

    return base;
  }

  private createClient(): ImapClientLike {
    const options = this.buildClientOptions();
    if (this.clientFactory) return this.clientFactory(options);
    // Lazy import keeps imapflow out of the bundle for the UI, which only ever
    // needs the MockProvider.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ImapFlow } = require('imapflow') as { ImapFlow: new (o: unknown) => ImapClientLike };
    return new ImapFlow(options);
  }

  async connect(): Promise<boolean> {
    if (this.connected) {
      throw new EmailProviderError({ code: 'ALREADY_CONNECTED', message: 'Already connected.' });
    }
    this.validateConfig();

    // The username is included: servers routinely echo it back in a rejection,
    // and while it is not a secret, an account address in a log is needless
    // exposure. The password and token are the ones that must never appear.
    const secrets = this.secretValues();

    const client = this.createClient();
    try {
      await client.connect();
      this.client = client;
      this.connected = true;
      return true;
    } catch (err) {
      // Never leave a half-open socket behind after a failed handshake.
      try {
        client.close();
      } catch {
        /* closing a socket that never opened can throw; nothing to do */
      }
      this.client = null;
      this.connected = false;
      throw classifyProviderError(err, secrets);
    }
  }

  /**
   * Close the connection. Always resets local state, even if the server refuses
   * LOGOUT, so a caller can never be left holding a dead client reference.
   */
  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.connected = false;
    if (!client) return;

    try {
      await client.logout();
    } catch (err) {
      try {
        client.close();
      } catch {
        /* already gone */
      }
      throw classifyProviderError(err, this.secretValues());
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Fail fast rather than issuing IMAP commands on a null socket. */
  private requireClient(): ImapClientLike {
    if (!this.client || !this.connected) {
      throw new EmailProviderError({
        code: 'NOT_CONNECTED',
        message: 'Connect the account before reading messages.',
      });
    }
    return this.client;
  }

  // ── Folder discovery ──────────────────────────────────────────────────

  /**
   * List folders on the server. `\Noselect` entries are excluded: they are
   * namespace markers, not readable mailboxes.
   */
  async listMailboxes(): Promise<MailboxInfo[]> {
    const client = this.requireClient();
    try {
      const raw = await client.list();
      return (raw ?? [])
        .filter((m) => m && typeof m.path === 'string' && m.path.length > 0)
        .filter((m) => !(m.flags && m.flags.has?.('\\Noselect')))
        .map((m) => ({
          path: m.path,
          delimiter: m.delimiter ?? '.',
          ...(m.specialUse ? { specialUse: m.specialUse } : {}),
          // Servers that report no subscription state are treated as subscribed.
          subscribed: m.subscribed ?? true,
        }));
    } catch (err) {
      throw classifyProviderError(err, this.secretValues());
    }
  }

  // ── Message reading ───────────────────────────────────────────────────

  /**
   * Fetch newest messages as normalized `EmailMessage` objects.
   *
   * UID ranges are used rather than sequence numbers so that concurrent
   * activity in the mailbox cannot shift the page window between calls.
   */
  async fetchMessages(limit = 50, offset = 0): Promise<EmailMessage[]> {
    const client = this.requireClient();
    const safeLimit = clamp(limit, 1, 500);
    const safeOffset = Math.max(0, offset);

    try {
      const lock = await client.getMailboxLock(this.mailbox);
      try {
        const uids = await client.search({ uid: `${safeOffset + 1}:*` });
        const uidList = Array.isArray(uids) ? uids : [];
        // Newest first, then page in memory: imapflow cannot slice a UID range
        // server-side, and materialising only the window we need keeps memory
        // bounded even when the mailbox is large.
        const newestFirst = [...uidList].sort((a, b) => b - a);
        const page = newestFirst.slice(safeOffset, safeOffset + safeLimit);
        if (page.length === 0) return [];

        return await this.fetchByUids(client, page);
      } finally {
        lock.release();
      }
    } catch (err) {
      throw classifyProviderError(err, this.secretValues());
    }
  }

  /** Fetch the full detail of a known UID list and normalize each message. */
  private async fetchByUids(client: ImapClientLike, uids: number[]): Promise<EmailMessage[]> {
    const range = uids.length === 1 ? String(uids[0]) : `${Math.min(...uids)}:${Math.max(...uids)}`;
    const collected: EmailMessage[] = [];
    for await (const raw of client.fetch(
      range,
      { uid: true, envelope: true, internalDate: true, flags: true, size: true, bodyStructure: true },
      { uid: true }
    )) {
      if (!raw) continue;
      const normalized = normalizeImapMessage(raw, this.mailbox);
      // The UID range above is a min..max span, so it can return messages that
      // were not requested. Drop anything outside the exact set.
      if (normalized.messageIdExternal && !uids.includes(Number(normalized.messageIdExternal))) {
        continue;
      }
      collected.push(normalized);
    }

    // A server returns a min..max FETCH in its own order, not the order asked
    // for. Restore the caller's ordering so pagination stays stable across calls.
    const order = new Map(uids.map((uid, index) => [uid, index]));
    collected.sort(
      (a, b) =>
        (order.get(Number(a.messageIdExternal)) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(Number(b.messageIdExternal)) ?? Number.MAX_SAFE_INTEGER)
    );
    return collected;
  }

  /**
   * Search the configured folder. `query` is a single term matched against
   * subject, from, and body text. IMAP's SEARCH has no body search, so body
   * matching is applied client-side over the fetched window.
   */
  async searchMessages(query: string, limit = 50): Promise<EmailMessage[]> {
    const client = this.requireClient();
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const safeLimit = clamp(limit, 1, 200);
    try {
      const lock = await client.getMailboxLock(this.mailbox);
      try {
        // HEADER searches are server-side; TEXT is not reliably supported by all
        // servers, so headers are searched here and bodies below.
        const uids = await client.search({
          or: [
            { subject: needle },
            { from: needle },
            { to: needle },
          ],
        });
        const uidList = Array.isArray(uids) ? uids : [];
        if (uidList.length === 0) return [];

        const candidates = [...uidList].sort((a, b) => b - a).slice(0, safeLimit * 2);
        const messages = await this.fetchByUids(client, candidates);

        return messages
          .filter(
            (m) =>
              m.subject.toLowerCase().includes(needle) ||
              m.sender.toLowerCase().includes(needle) ||
              m.recipient.toLowerCase().includes(needle) ||
              m.body.toLowerCase().includes(needle)
          )
          .slice(0, safeLimit);
      } finally {
        lock.release();
      }
    } catch (err) {
      throw classifyProviderError(err, this.secretValues());
    }
  }

  /** Mark a message read. `messageId` is the external (UID) id. */
  async markAsRead(messageId: string): Promise<boolean> {
    const client = this.requireClient();
    const uid = Number(messageId);
    if (!Number.isInteger(uid) || uid <= 0) {
      throw new EmailProviderError({
        code: 'CONFIG_INVALID',
        message: 'The message id must be the numeric UID returned by this provider.',
      });
    }
    try {
      const lock = await client.getMailboxLock(this.mailbox);
      try {
        return await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    } catch (err) {
      throw classifyProviderError(err, this.secretValues());
    }
  }

  /**
   * Unread count for the configured folder.
   *
   * Returns 0 rather than throwing when there is no connection or the server
   * cannot report UNSEEN: this feeds an advisory badge in the UI, so a missing
   * count should degrade quietly instead of failing a connection test.
   */
  async getUnreadCount(): Promise<number> {
    if (!this.client || !this.connected) return 0;
    try {
      const status = await this.client.status(this.mailbox, { unseen: true });
      if (!status) return 0;
      return status.unseen ?? 0;
    } catch {
      return 0;
    }
  }

  /** Folder the provider reads from. */
  getMailbox(): string {
    return this.mailbox;
  }

  /** Connection test with folder count included, so the UI can show readiness. */
  override async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      await this.connect();
      const [unread, mailboxes] = await Promise.all([
        this.getUnreadCount(),
        this.listMailboxes().catch(() => [] as MailboxInfo[]),
      ]);
      return {
        success: true,
        providerType: this.config.type,
        latencyMs: Date.now() - started,
        mailboxes: mailboxes.length,
        unreadCount: unread,
      };
    } catch (err) {
      return {
        success: false,
        providerType: this.config.type,
        latencyMs: Date.now() - started,
        ...describeError(err),
      };
    } finally {
      await this.disconnect().catch(() => undefined);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Flatten a `MessageAddressObject[]` to a display string. */
function formatAddresses(list: Array<{ name?: string; address?: string }> | undefined): string {
  if (!list || list.length === 0) return '';
  return list
    .map((a) => (a.name ? `${a.name} <${a.address ?? ''}>` : (a.address ?? '')))
    .filter(Boolean)
    .join(', ');
}

/**
 * Convert an imapflow message into the project's `EmailMessage`.
 *
 * This is the only place raw imapflow shapes are interpreted. Everything
 * downstream (database, OTP parser, UI) sees `EmailMessage` and never has to
 * know which provider produced it.
 */
export function normalizeImapMessage(raw: ImapFetchedMessage, mailbox: string): EmailMessage {
  const envelope = raw.envelope ?? {};
  const uid = raw.uid ?? raw.seqnum;

  const received = envelope.date ?? raw.internalDate;
  const receivedAt = toDate(received);

  const flags = raw.flags ?? new Set<string>();
  const isRead = flags.has('\\Seen');

  const parts = raw.bodyParts ?? new Map<string, Buffer>();
  const text = bufferOf(parts, '1');
  const html = findHtmlPart(parts);

  const attachments: EmailAttachment[] = [];
  for (const [key, value] of parts) {
    // Parts 1 and the detected HTML part are the body, not attachments.
    if (key === '1' || key === html?.key) continue;
    if (!isAttachmentKey(key)) continue;
    attachments.push({
      id: `imap-att-${key}`,
      filename: `part-${key}`,
      contentType: 'application/octet-stream',
      size: value?.length ?? 0,
    });
  }

  return {
    id: `imap-${mailbox}-${uid ?? 'unknown'}`,
    messageIdExternal: uid != null ? String(uid) : undefined,
    subject: envelope.subject?.trim() || '(no subject)',
    sender: formatAddresses(envelope.from) || formatAddresses(envelope.sender),
    recipient: formatAddresses(envelope.to),
    body: text.toString('utf8').slice(0, MAX_BODY_CHARS),
    bodyHtml: html ? html.value.toString('utf8').slice(0, MAX_BODY_CHARS) : undefined,
    receivedAt,
    isRead,
    attachments,
    ...(envelope.messageId ? { rawHeaders: envelope.messageId } : {}),
  };
}

/** Keys like `2`, `2.1` are body parts; anything else is not an attachment slot. */
function isAttachmentKey(key: string): boolean {
  return /^\d+(\.\d+)*$/.test(key);
}

function bufferOf(parts: Map<string, Buffer>, key: string): Buffer {
  return parts.get(key) ?? Buffer.alloc(0);
}

function findHtmlPart(parts: Map<string, Buffer>): { key: string; value: Buffer } | null {
  for (const [key, value] of parts) {
    if (key !== '1' && isAttachmentKey(key) && looksLikeHtml(value)) {
      return { key, value };
    }
  }
  return null;
}

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 200).toString('utf8').toLowerCase();
  return head.includes('<html') || head.includes('<body') || head.includes('<div') || head.includes('<p>');
}

/** Parse a date from imapflow without producing an Invalid Date. */
function toDate(value: Date | string | undefined): Date {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date() : value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
