/**
 * IMAP provider tests.
 *
 * Everything here runs against the in-memory fake client: no network, no mail
 * server, no credentials. The suite covers connection, authentication failure,
 * timeouts, TLS failure, malformed config, missing folders, normalization,
 * fetching, folder selection, search, mark-as-read, unread count, and cleanup.
 */

import { describe, it, expect } from 'vitest';
import { ImapProvider, normalizeImapMessage } from './imap-provider.js';
import { EmailProviderError, classifyProviderError, scrubSecrets } from './errors.js';
import type { EmailProviderConfig } from './types.js';
import { createFakeClient, fakeMessage, type FakeClient } from './testing/fake-imap-client.js';

const PASSWORD = 'sup3r-secret-value';

const BASE_CONFIG: EmailProviderConfig = {
  type: 'imap',
  host: 'imap.example.test',
  port: 993,
  user: 'owner@example.test',
  password: PASSWORD,
  authMethod: 'password',
  security: 'tls',
};

/**
 * Build a provider wired to a fake client, and hand back the fake.
 *
 * The fake is created eagerly and the provider's factory returns it, recording
 * the options the provider built. That keeps `client` defined from the moment
 * the harness is constructed, so a test that never connects can still assert on
 * it (for example: "a rejected config never opened a socket").
 */
function makeProvider(
  config: Partial<EmailProviderConfig> = {},
  clientOptions: Parameters<typeof createFakeClient>[1] = {}
): { provider: ImapProvider; client: FakeClient } {
  const client = createFakeClient({}, clientOptions);
  const provider = new ImapProvider({ ...BASE_CONFIG, ...config }, 'acct-1', 'ident-1', {
    clientFactory: (opts) => {
      client.setOptions(opts);
      return client;
    },
  });
  return { provider, client };
}

// ── Connection ───────────────────────────────────────────────────────────

describe('ImapProvider — connection', () => {
  it('connects and passes the expected host, port, TLS and auth to the client', async () => {
    const { provider, client } = makeProvider();
    await expect(provider.connect()).resolves.toBe(true);
    expect(client.connectCount).toBe(1);
    expect(client.options).toMatchObject({
      host: 'imap.example.test',
      port: 993,
      secure: true,
      auth: { user: 'owner@example.test', pass: PASSWORD },
    });
  });

  it('defaults to port 993 for TLS and 143 otherwise', async () => {
    const tls = makeProvider({ port: undefined });
    await tls.provider.connect();
    expect(tls.client.options.port).toBe(993);

    const starttls = makeProvider({ port: undefined, security: 'starttls' });
    await starttls.provider.connect();
    expect(starttls.client.options.port).toBe(143);
    expect(starttls.client.options.secure).toBe(false);
  });

  it('applies a connection timeout budget', async () => {
    const { provider, client } = makeProvider({ timeoutMs: 4321 });
    await provider.connect();
    expect(client.options.connectionTimeout).toBe(4321);
  });

  it('uses a bearer token for oauth2 authentication', async () => {
    const { provider, client } = makeProvider({
      authMethod: 'oauth2',
      accessToken: 'ya29.token-value',
    });
    await provider.connect();
    expect(client.options.auth).toEqual({ user: 'owner@example.test', accessToken: 'ya29.token-value' });
  });

  it('refuses plaintext IMAP against a remote host', async () => {
    const { provider } = makeProvider({ security: 'none' });
    await expect(provider.connect()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('allows plaintext IMAP against localhost for a local test server', async () => {
    const { provider, client } = makeProvider({ host: '127.0.0.1', port: 1143, security: 'none' });
    await expect(provider.connect()).resolves.toBe(true);
    expect(client.options.secure).toBe(false);
  });

  it('rejects a second connect while already connected', async () => {
    const { provider } = makeProvider();
    await provider.connect();
    await expect(provider.connect()).rejects.toMatchObject({ code: 'ALREADY_CONNECTED' });
  });

  it('cleans up the socket when the handshake fails', async () => {
    const { provider, client } = makeProvider({}, {
      connectError: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    await expect(provider.connect()).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    // A failed connect must not leave a half-open client behind.
    expect(client.closeCount).toBe(1);
    expect(provider.isConnected()).toBe(false);
  });
});

// ── Configuration validation ─────────────────────────────────────────────

describe('ImapProvider — malformed configuration', () => {
  it('rejects a missing host without opening a socket', async () => {
    const { provider, client } = makeProvider({ host: undefined });
    await expect(provider.connect()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
    expect(client.connectCount).toBe(0);
  });

  it('rejects a missing user', async () => {
    const { provider } = makeProvider({ user: undefined });
    await expect(provider.connect()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('rejects password auth with no password', async () => {
    const { provider } = makeProvider({ password: undefined });
    const err = await provider.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailProviderError);
    expect((err as EmailProviderError).code).toBe('CONFIG_INVALID');
    expect((err as EmailProviderError).message).toContain('password');
  });

  it('rejects oauth2 auth with no token', async () => {
    const { provider } = makeProvider({ authMethod: 'oauth2', accessToken: undefined });
    await expect(provider.connect()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('names every missing field at once', async () => {
    const { provider } = makeProvider({ host: undefined, user: undefined });
    const err = (await provider.connect().catch((e: unknown) => e)) as EmailProviderError;
    expect(err.message).toContain('host');
    expect(err.message).toContain('user');
  });
});

// ── Error classification ─────────────────────────────────────────────────

describe('ImapProvider — error classification', () => {
  const cases: Array<[string, Error, string]> = [
    ['authentication rejection', new Error('Command failed: NO [AUTHENTICATIONFAILED] Invalid credentials'), 'AUTH_FAILED'],
    ['timeout', Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' }), 'TIMEOUT'],
    ['tls certificate failure', new Error('self signed certificate in certificate chain'), 'TLS_FAILED'],
    ['refused connection', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'CONNECTION_FAILED'],
    ['dns failure', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }), 'CONNECTION_FAILED'],
    ['missing mailbox', Object.assign(new Error('No such mailbox'), { code: 'NotFound' }), 'MAILBOX_NOT_FOUND'],
  ];

  for (const [label, thrown, expectedCode] of cases) {
    it(`maps ${label} to ${expectedCode}`, async () => {
      const { provider } = makeProvider({}, { connectError: thrown });
      const err = (await provider.connect().catch((e: unknown) => e)) as EmailProviderError;
      expect(err).toBeInstanceOf(EmailProviderError);
      expect(err.code).toBe(expectedCode);
    });
  }

  it('reports a user-actionable flag for fixable errors', async () => {
    const { provider } = makeProvider({}, { connectError: new Error('Authentication failed') });
    const err = (await provider.connect().catch((e: unknown) => e)) as EmailProviderError;
    expect(err.userActionable).toBe(true);
    expect(err.toJSON().code).toBe('AUTH_FAILED');
  });
});

// ── Secret containment ───────────────────────────────────────────────────

describe('ImapProvider — secrets never escape', () => {
  it('redacts the password from an error message', async () => {
    const { provider } = makeProvider(
      {},
      { connectError: new Error(`Command failed for ${PASSWORD} at owner@example.test`) }
    );
    const err = (await provider.connect().catch((e: unknown) => e)) as EmailProviderError;
    const rendered = `${err.message} ${err.detail ?? ''} ${JSON.stringify(err.toJSON())}`;
    expect(rendered).not.toContain(PASSWORD);
    expect(rendered).toContain('[REDACTED]');
  });

  it('redacts the username too', async () => {
    const { provider } = makeProvider({}, { connectError: new Error('rejected owner@example.test') });
    const err = (await provider.connect().catch((e: unknown) => e)) as EmailProviderError;
    expect(err.detail).not.toContain('owner@example.test');
  });

  it('scrubs secrets from a raw message', () => {
    expect(scrubSecrets(`token=${PASSWORD}`, [PASSWORD])).toBe('token=[REDACTED]');
  });

  it('handles a secret containing regex metacharacters', () => {
    const tricky = 'a+b*c(d)';
    expect(scrubSecrets(`bad ${tricky}`, [tricky])).toBe('bad [REDACTED]');
  });

  it('does not over-redact for very short secrets', () => {
    // A 2-character "secret" would otherwise redact ordinary substrings.
    expect(scrubSecrets('connection established', ['on'])).toBe('connection established');
  });

  it('keeps the password out of a successful test result', async () => {
    const { provider } = makeProvider();
    const result = await provider.testConnection();
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });
});

// ── Folder discovery ─────────────────────────────────────────────────────

describe('ImapProvider — folder discovery', () => {
  it('lists mailboxes with their special-use flags', async () => {
    const { provider } = makeProvider();
    await provider.connect();
    const folders = await provider.listMailboxes();
    expect(folders.map((f) => f.path)).toEqual(['INBOX', 'Archive']);
    expect(folders[0].delimiter).toBe('.');
    expect(folders[1].subscribed).toBe(false);
  });

  it('excludes namespace markers that cannot be opened', async () => {
    const { provider } = makeProvider({}, {
      mailboxes: [
        { path: 'INBOX', flags: new Set(['\\Inbox']) },
        { path: '[Gmail]', flags: new Set(['\\Noselect']) },
      ],
    });
    await provider.connect();
    const folders = await provider.listMailboxes();
    expect(folders.map((f) => f.path)).toEqual(['INBOX']);
  });

  it('treats a server that reports no subscription state as subscribed', async () => {
    const { provider } = makeProvider({}, { mailboxes: [{ path: 'INBOX' }] });
    await provider.connect();
    const [inbox] = await provider.listMailboxes();
    expect(inbox.subscribed).toBe(true);
  });

  it('surfaces a missing folder as MAILBOX_NOT_FOUND', async () => {
    const { provider } = makeProvider({ mailbox: 'DoesNotExist' }, {
      lockError: Object.assign(new Error('No such mailbox'), { code: 'NotFound' }),
    });
    await provider.connect();
    await expect(provider.fetchMessages()).rejects.toMatchObject({ code: 'MAILBOX_NOT_FOUND' });
  });

  it('reads from the configured folder, not a hardcoded INBOX', async () => {
    const { provider, client } = makeProvider({ mailbox: 'Archive/2026' });
    await provider.connect();
    await provider.fetchMessages(5);
    expect(client.calls).toContain('lock:Archive/2026');
  });
});

// ── Fetching and normalization ───────────────────────────────────────────

describe('ImapProvider — fetching messages', () => {
  const threeMessages = new Map<number, ReturnType<typeof fakeMessage>>([
    [1, fakeMessage({ uid: 1, envelope: { subject: 'One', from: [{ address: 'a@x.test' }], to: [{ address: 'me@example.test' }] } })],
    [2, fakeMessage({ uid: 2, envelope: { subject: 'Two', from: [{ address: 'b@x.test' }], to: [{ address: 'me@example.test' }] } })],
    [3, fakeMessage({ uid: 3, envelope: { subject: 'Three', from: [{ address: 'c@x.test' }], to: [{ address: 'me@example.test' }] } })],
  ]);

  it('normalizes into the project EmailMessage shape', async () => {
    const { provider } = makeProvider({}, { messages: threeMessages });
    await provider.connect();
    // Newest first, so a limit of 1 yields the highest UID.
    const [message] = await provider.fetchMessages(1);

    expect(message).toMatchObject({
      subject: 'Three',
      sender: 'c@x.test',
      recipient: 'me@example.test',
      isRead: false,
    });
    expect(message.body).toContain('847291');
    expect(message.receivedAt).toBeInstanceOf(Date);
    expect(message.messageIdExternal).toBe('3');
    expect(Array.isArray(message.attachments)).toBe(true);
  });

  it('returns newest first and honours limit and offset', async () => {
    const { provider } = makeProvider({}, { messages: threeMessages });
    await provider.connect();

    const all = await provider.fetchMessages(10);
    expect(all.map((m) => m.messageIdExternal)).toEqual(['3', '2', '1']);

    const paged = await provider.fetchMessages(1, 1);
    expect(paged).toHaveLength(1);
    expect(paged[0].messageIdExternal).toBe('2');
  });

  it('returns an empty list for an empty mailbox', async () => {
    const { provider } = makeProvider({}, { messages: new Map() });
    await provider.connect();
    await expect(provider.fetchMessages()).resolves.toEqual([]);
  });

  it('refuses to read before connecting', async () => {
    const { provider } = makeProvider();
    await expect(provider.fetchMessages()).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
  });

  it('releases the mailbox lock even when the fetch fails', async () => {
    const { provider, client } = makeProvider({}, { searchError: new Error('connection closed') });
    await provider.connect();
    await expect(provider.fetchMessages()).rejects.toBeTruthy();
    expect(client.openLocks).toBe(0);
  });

  it('marks messages read based on the \\Seen flag', async () => {
    const { provider } = makeProvider({}, {
      messages: new Map([[1, fakeMessage({ uid: 1, flags: new Set(['\\Seen']) })]]),
    });
    await provider.connect();
    const [message] = await provider.fetchMessages(1);
    expect(message.isRead).toBe(true);
  });
});

describe('normalizeImapMessage', () => {
  it('falls back to a placeholder subject and empty addresses', () => {
    const message = normalizeImapMessage({ uid: 7, envelope: {} }, 'INBOX');
    expect(message.subject).toBe('(no subject)');
    expect(message.sender).toBe('');
    expect(message.receivedAt).toBeInstanceOf(Date);
  });

  it('never yields an Invalid Date', () => {
    const message = normalizeImapMessage(
      { uid: 1, envelope: { date: 'not-a-date' }, internalDate: 'also-not-a-date' },
      'INBOX'
    );
    expect(Number.isNaN(message.receivedAt.getTime())).toBe(false);
  });

  it('formats named addresses as display names', () => {
    const message = normalizeImapMessage(
      { uid: 1, envelope: { from: [{ name: 'Auth Service', address: 'auth@x.test' }] } },
      'INBOX'
    );
    expect(message.sender).toBe('Auth Service <auth@x.test>');
  });

  it('detects an HTML part and keeps it out of the attachment list', () => {
    const message = normalizeImapMessage(
      {
        uid: 1,
        envelope: { subject: 's' },
        bodyParts: new Map<string, Buffer>([
          ['1', Buffer.from('plain text')],
          ['2', Buffer.from('<html><body>rich</body></html>')],
          ['3', Buffer.from('%PDF-1.4 fake attachment')],
        ]),
      },
      'INBOX'
    );
    expect(message.bodyHtml).toContain('<html>');
    expect(message.attachments).toHaveLength(1);
  });

  it('truncates an oversized body', () => {
    const message = normalizeImapMessage(
      { uid: 1, envelope: {}, bodyParts: new Map([['1', Buffer.from('x'.repeat(50_000))]]) },
      'INBOX'
    );
    expect(message.body.length).toBe(20_000);
  });

  it('scopes the message id to the folder it came from', () => {
    expect(normalizeImapMessage({ uid: 5, envelope: {} }, 'Archive').id).toBe('imap-Archive-5');
  });
});

// ── Search, flags, unread count ──────────────────────────────────────────

describe('ImapProvider — search, flags and unread count', () => {
  it('matches on subject, sender and body', async () => {
    // The fake returns every UID from `search`, so the provider's own
    // client-side filter is what decides the result.
    const { provider } = makeProvider({}, {
      messages: new Map([
        [1, fakeMessage({
          uid: 1,
          envelope: { subject: 'Verification code 111111', from: [{ address: 'auth@x.test' }] },
          bodyParts: new Map([['1', Buffer.from('your code is 111111')]]),
        })],
        [2, fakeMessage({
          uid: 2,
          envelope: { subject: 'Newsletter', from: [{ address: 'news@x.test' }] },
          bodyParts: new Map([['1', Buffer.from('nothing relevant')]]),
        })],
      ]),
    });
    await provider.connect();

    expect(await provider.searchMessages('verification')).toHaveLength(1);
    expect(await provider.searchMessages('news@x.test')).toHaveLength(1);
    expect(await provider.searchMessages('111111')).toHaveLength(1);
    expect(await provider.searchMessages('nothing-matches')).toHaveLength(0);
  });

  it('returns nothing for a blank query without touching the server', async () => {
    const { provider, client } = makeProvider();
    await provider.connect();
    await expect(provider.searchMessages('   ')).resolves.toEqual([]);
    expect(client.calls).not.toContain('search');
  });

  it('sets the \\Seen flag by UID', async () => {
    const { provider, client } = makeProvider();
    await provider.connect();
    await expect(provider.markAsRead('42')).resolves.toBe(true);
    expect(client.flagsAdded).toEqual([{ range: '42', flags: ['\\Seen'] }]);
  });

  it('rejects a non-numeric message id', async () => {
    const { provider } = makeProvider();
    await provider.connect();
    await expect(provider.markAsRead('not-a-uid')).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('reports the unread count', async () => {
    const { provider } = makeProvider({}, { unseen: 12 });
    await provider.connect();
    await expect(provider.getUnreadCount()).resolves.toBe(12);
  });

  it('degrades to zero when the server cannot report unread', async () => {
    const { provider } = makeProvider({}, { statusError: new Error('UNSEEN not supported') });
    await provider.connect();
    await expect(provider.getUnreadCount()).resolves.toBe(0);
  });

  it('reports zero unread before connecting', async () => {
    const { provider } = makeProvider();
    await expect(provider.getUnreadCount()).resolves.toBe(0);
  });
});

// ── Disconnect and cleanup ───────────────────────────────────────────────

describe('ImapProvider — disconnect and cleanup', () => {
  it('logs out and drops the client', async () => {
    const { provider, client } = makeProvider();
    await provider.connect();
    await provider.disconnect();
    expect(client.logoutCount).toBe(1);
    expect(provider.isConnected()).toBe(false);
  });

  it('is safe to call when never connected', async () => {
    const { provider } = makeProvider();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });

  it('is safe to call twice', async () => {
    const { provider, client } = makeProvider();
    await provider.connect();
    await provider.disconnect();
    await provider.disconnect();
    expect(client.logoutCount).toBe(1);
  });

  it('closes the socket when LOGOUT fails, and still clears local state', async () => {
    const { provider, client } = makeProvider({}, { logoutError: new Error('connection closed') });
    await provider.connect();
    await expect(provider.disconnect()).rejects.toBeTruthy();
    expect(client.closeCount).toBe(1);
    expect(provider.isConnected()).toBe(false);
  });

  it('allows reconnecting after a disconnect', async () => {
    const { provider, client } = makeProvider();
    await provider.connect();
    await provider.disconnect();
    await expect(provider.connect()).resolves.toBe(true);
    expect(client.connectCount).toBe(2);
  });

  it('leaves no mailbox lock open after a fetch', async () => {
    const { provider, client } = makeProvider({}, {
      messages: new Map([[1, fakeMessage()]]),
    });
    await provider.connect();
    await provider.fetchMessages();
    expect(client.openLocks).toBe(0);
  });
});

// ── Connection test ──────────────────────────────────────────────────────

describe('ImapProvider — connection test', () => {
  it('reports success with latency, folders and unread count', async () => {
    const { provider } = makeProvider({}, { unseen: 3, messages: new Map([[1, fakeMessage()]]) });
    const result = await provider.testConnection();
    expect(result.success).toBe(true);
    expect(result.providerType).toBe('imap');
    expect(result.unreadCount).toBe(3);
    expect(result.mailboxes).toBe(2);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('does not throw on failure, and always disconnects', async () => {
    const { provider, client } = makeProvider({}, {
      connectError: new Error('Authentication failed'),
    });
    const result = await provider.testConnection();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AUTH_FAILED');
    expect(client.logoutCount).toBe(0); // never connected, so nothing to log out
    expect(provider.isConnected()).toBe(false);
  });

  it('closes the connection after a successful test', async () => {
    const { provider, client } = makeProvider();
    await provider.testConnection();
    expect(client.logoutCount).toBe(1);
    expect(provider.isConnected()).toBe(false);
  });
});

describe('classifyProviderError', () => {
  it('passes an EmailProviderError through unchanged', () => {
    const original = new EmailProviderError({ code: 'AUTH_FAILED', message: 'nope' });
    expect(classifyProviderError(original)).toBe(original);
  });

  it('falls back to UNKNOWN for an unrecognized failure', () => {
    expect(classifyProviderError(new Error('something odd')).code).toBe('UNKNOWN');
  });

  it('survives a thrown non-error', () => {
    expect(() => classifyProviderError('a string')).not.toThrow();
    expect(classifyProviderError(undefined).code).toBe('UNKNOWN');
  });
});
