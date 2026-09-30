/**
 * Test double for the imapflow client.
 *
 * The provider takes a `clientFactory`, so every test here runs against an
 * in-memory fake: no socket is opened, no mail server is contacted, and no
 * credentials are needed. Failure modes (auth refusal, timeout, TLS error,
 * missing folder) are produced by making the fake throw the same shapes the
 * real library and Node's net/tls layers throw, so the provider's error
 * classification is genuinely exercised.
 */

// This file lives in `src/testing/`, so the provider is one level up.
import type { ImapClientLike, ImapMailboxLike, ImapFetchedMessage } from '../imap-provider.js';

export interface FakeClientOptions {
  /** Throw this from `connect()`. */
  connectError?: Error;
  /** Throw this from `logout()`. */
  logoutError?: Error;
  /** Throw this from `search()`. */
  searchError?: Error;
  /** Throw this from `getMailboxLock()`. */
  lockError?: Error;
  /** Throw this from `status()`. */
  statusError?: Error;
  mailboxes?: ImapMailboxLike[];
  /** UID -> message. */
  messages?: Map<number, ImapFetchedMessage>;
  /** UIDs returned by `search()`. Defaults to every message UID. */
  searchResult?: number[];
  unseen?: number;
}

export interface FakeClient extends ImapClientLike {
  /** Options the provider built, for assertions on host/port/TLS/auth. */
  readonly options: Record<string, unknown>;
  /** Called by the provider when it builds options; recorded for assertions. */
  setOptions(o: Record<string, unknown>): void;
  readonly calls: string[];
  connectCount: number;
  logoutCount: number;
  closeCount: number;
  /** Mailbox locks opened but not yet released. Must be 0 after a test. */
  openLocks: number;
  releasedLocks: number;
  flagsAdded: Array<{ range: string; flags: string[] }>;
}

export function createFakeClientFactory(options: FakeClientOptions = {}): (o: Record<string, unknown>) => ImapClientLike {
  return (clientOptions) => createFakeClient(clientOptions, options);
}

export function createFakeClient(
  clientOptions: Record<string, unknown>,
  options: FakeClientOptions = {}
): FakeClient {
  const messages = options.messages ?? new Map<number, ImapFetchedMessage>();

  const state = {
    options: clientOptions,
    calls: [] as string[],
    connectCount: 0,
    logoutCount: 0,
    closeCount: 0,
    openLocks: 0,
    releasedLocks: 0,
    flagsAdded: [] as Array<{ range: string; flags: string[] }>,
  };

  const client: FakeClient = {
    get options() {
      return state.options;
    },
    setOptions(o: Record<string, unknown>) {
      state.options = o;
    },
    get calls() {
      return state.calls;
    },
    get connectCount() {
      return state.connectCount;
    },
    get logoutCount() {
      return state.logoutCount;
    },
    get closeCount() {
      return state.closeCount;
    },
    get openLocks() {
      return state.openLocks;
    },
    get releasedLocks() {
      return state.releasedLocks;
    },
    get flagsAdded() {
      return state.flagsAdded;
    },

    async connect() {
      state.calls.push('connect');
      state.connectCount += 1;
      if (options.connectError) throw options.connectError;
    },

    async logout() {
      state.calls.push('logout');
      state.logoutCount += 1;
      if (options.logoutError) throw options.logoutError;
    },

    close() {
      state.calls.push('close');
      state.closeCount += 1;
    },

    async list() {
      state.calls.push('list');
      return options.mailboxes ?? [
        { path: 'INBOX', delimiter: '.', subscribed: true, flags: new Set(['\\Inbox']) },
        { path: 'Archive', delimiter: '.', subscribed: false, flags: new Set(['\\Archive']) },
      ];
    },

    async search() {
      state.calls.push('search');
      if (options.searchError) throw options.searchError;
      return options.searchResult ?? [...messages.keys()];
    },

    async status() {
      state.calls.push('status');
      if (options.statusError) throw options.statusError;
      return { unseen: options.unseen ?? 0 };
    },

    async *fetch(range: string) {
      state.calls.push(`fetch:${range}`);
      const [lo, hi] = range.split(':');
      const loN = Number(lo);
      const hiN = hi === '*' ? Infinity : Number(hi);
      for (const [uid, message] of messages) {
        if (uid < loN || uid > hiN) continue;
        yield message;
      }
    },

    async messageFlagsAdd(range: string, flags: string[]) {
      state.calls.push(`flags:${range}`);
      state.flagsAdded.push({ range, flags });
      return true;
    },

    async getMailboxLock(path: string) {
      state.calls.push(`lock:${path}`);
      if (options.lockError) throw options.lockError;
      state.openLocks += 1;
      return {
        path,
        release() {
          state.calls.push('release');
          state.openLocks -= 1;
          state.releasedLocks += 1;
        },
      };
    },
  };

  return client;
}

/** Build an imapflow-shaped message with a text body part. */
export function fakeMessage(overrides: Partial<ImapFetchedMessage> = {}): ImapFetchedMessage {
  return {
    uid: 1,
    seqnum: 1,
    internalDate: new Date('2026-09-30T10:00:00.000Z'),
    flags: new Set<string>(),
    size: 512,
    envelope: {
      subject: 'Your verification code is 847291',
      messageId: '<abc123@example.test>',
      date: new Date('2026-09-30T10:00:00.000Z'),
      from: [{ name: 'Auth Service', address: 'auth@example.test' }],
      to: [{ address: 'me@example.test' }],
    },
    bodyParts: new Map<string, Buffer>([['1', Buffer.from('Your verification code is: 847291')]]),
    ...overrides,
  };
}
