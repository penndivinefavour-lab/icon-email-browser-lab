/**
 * Gmail provider unit tests.
 *
 * Uses a fake Google OAuth + Gmail REST server so zero real credentials or
 * network are needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GmailProvider, normalizeGmailMessage, type GmailHttpClient } from './gmail-provider.js';
import { createFakeGoogleServer, generateState, generateCodeVerifier, generateCodeChallenge, buildAuthUrl, type FakeTokenData } from './testing/fake-google-server.js';

const FAKE_TOKENS: FakeTokenData = { accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token', expiresIn: 3600 };
const FAKE_CONFIG = {
  type: 'gmail' as const,
  clientId: 'fake-client-id',
  clientSecret: 'fake-client-secret',
  redirectUri: 'http://localhost:3000/oauth2callback',
};

let fake: ReturnType<typeof createFakeGoogleServer>;
let apiBaseUrl = '';

beforeEach(async () => {
  fake = createFakeGoogleServer(0);
  await new Promise<void>((resolve) => fake.server.once('listening', resolve));
  await new Promise((r) => setTimeout(r, 50));
  const port = (fake.server.address() as any)?.port ?? 0;
  apiBaseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  if (fake.server.listening) {
    fake.server.close();
  }
});

function makeLoader(tokens: FakeTokenData) {
  return async () => ({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
}

function makeProvider(httpClient: GmailHttpClient) {
  return (accountId = 'acc-1', identityId = 'id-1') =>
    new GmailProvider(FAKE_CONFIG, accountId, identityId, makeLoader(FAKE_TOKENS), {
      httpClient,
      apiBaseUrl,
    });
}

describe('GmailProvider — connection lifecycle', () => {
  it('connects with valid tokens', async () => {
    const p = makeProvider(fake.createHttpClient())();
    expect(await p.connect()).toBe(true);
    expect(p.isConnected()).toBe(true);
  });

  it('returns true when already connected', async () => {
    const p = makeProvider(fake.createHttpClient())();
    await p.connect();
    expect(await p.connect()).toBe(true);
  });

  it('throws AUTH_FAILED when no tokens are stored', async () => {
    const emptyLoader = () => Promise.resolve(null);
    const p = new GmailProvider(FAKE_CONFIG, 'acc-1', 'id-1', emptyLoader, { httpClient: fake.createHttpClient() });
    await expect(p.connect()).rejects.toThrow('No Gmail credentials found');
  });

  it('disconnects and clears state', async () => {
    const p = makeProvider(fake.createHttpClient())();
    await p.connect();
    await p.disconnect();
    expect(p.isConnected()).toBe(false);
  });

  it('disconnect is idempotent', async () => {
    const p = makeProvider(fake.createHttpClient())();
    await p.disconnect(); // should not throw
    expect(p.isConnected()).toBe(false);
  });
});

describe('GmailProvider — message listing', () => {
  it('fetches messages from the fake server', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msgs = await p.fetchMessages(5);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0].subject).toContain('Test Subject');
    expect(msgs[0].body).toContain('Test body message');
  });

  it('respects pagination limit', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msgs = await p.fetchMessages(3);
    expect(msgs.length).toBeLessThanOrEqual(3);
  });

  it('handles network errors gracefully', async () => {
    // Use a client that throws to simulate network failure
    const failingClient = { request: () => Promise.reject(new Error('Network failure')) };
    const p = new GmailProvider(FAKE_CONFIG, 'acc-1', 'id-1', makeLoader(FAKE_TOKENS), {
      httpClient: failingClient as any,
    });
    await expect(p.fetchMessages(1)).rejects.toThrow();
  });
});

describe('GmailProvider — search', () => {
  it('searches by query string', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msgs = await p.searchMessages('verification');
    expect(Array.isArray(msgs)).toBe(true);
  });
});

describe('GmailProvider — unread count', () => {
  it('returns unread count from fake server', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const count = await p.getUnreadCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

describe('GmailProvider — mailboxes/labels', () => {
  it('lists labels from fake server', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const labels = await p.listMailboxes();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].path).toBeTruthy();
  });
});

describe('GmailProvider — connection test', () => {
  it('returns success on valid connection', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const result = await p.testConnection();
    expect(result.success).toBe(true);
    expect(result.providerType).toBe('gmail');
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('returns failure when no tokens', async () => {
    const emptyLoader = () => Promise.resolve(null);
    const p = new GmailProvider(FAKE_CONFIG, 'acc-1', 'id-1', emptyLoader, { httpClient: fake.createHttpClient() });
    const result = await p.testConnection();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AUTH_FAILED');
  });
});

describe('GmailProvider — mark as read', () => {
  it('marks a message as read via modify endpoint', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const ok = await p.markAsRead('fake-msg-1');
    expect(ok).toBe(true);
  });
});

describe('normalizeGmailMessage', () => {
  it('normalizes a Gmail API message to EmailMessage', () => {
    const msg = {
      id: 'msg-123',
      threadId: 'thread-1',
      labelIds: ['UNREAD'],
      snippet: 'Test snippet',
      payload: {
        headers: [
          { name: 'From', value: 'sender@test.com' },
          { name: 'To', value: 'recipient@test.com' },
          { name: 'Subject', value: 'Hello World' },
          { name: 'Date', value: 'Mon, 1 Jan 2024 00:00:00 +0000' },
          { name: 'Message-ID', value: '<msg-123@test.com>' },
        ],
        mimeType: 'text/plain',
        parts: [
          {
            partId: '0',
            mimeType: 'text/plain',
            filename: '',
            headers: [],
            body: { size: 12, data: btoa('Hello World') },
          },
        ],
      },
      internalDate: '1704067200000',
    } as any;

    const normalized = normalizeGmailMessage(msg);
    expect(normalized.id).toBe('gmail-msg-123');
    expect(normalized.messageIdExternal).toBe('msg-123');
    expect(normalized.subject).toBe('Hello World');
    expect(normalized.sender).toBe('sender@test.com');
    expect(normalized.recipient).toBe('recipient@test.com');
    expect(normalized.body).toBe('Hello World');
    expect(normalized.isRead).toBe(false);
    expect(normalized.receivedAt instanceof Date).toBe(true);
  });

  it('handles missing parts gracefully', () => {
    const msg = {
      id: 'msg-456',
      threadId: 'thread-2',
      labelIds: [],
      snippet: 'No parts',
      payload: {
        headers: [
          { name: 'Subject', value: 'Test' },
          { name: 'From', value: 'from@test.com' },
          { name: 'To', value: 'to@test.com' },
          { name: 'Date', value: 'Tue, 2 Jan 2024 00:00:00 +0000' },
        ],
        mimeType: 'text/plain',
      },
      internalDate: '1704153600000',
    } as any;

    const normalized = normalizeGmailMessage(msg);
    expect(normalized.body).toBe('No parts');
    expect(normalized.attachments).toEqual([]);
  });
});

describe('OAuth helper functions', () => {
  it('generates a state string of expected length', () => {
    const state = generateState(32);
    expect(state.length).toBe(64);
  });

  it('generates a code verifier of expected length', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('generates a code challenge from a verifier', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    expect(challenge).not.toContain('=');
  });

  it('builds an auth URL with correct parameters', () => {
    const state = generateState();
    const codeChallenge = 'fake-code-challenge';
    const url = buildAuthUrl({
      clientId: 'fake-client-id',
      redirectUri: 'http://localhost:3000/oauth2callback',
      state,
      codeChallenge,
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
    });
    expect(url).toContain('client_id=fake-client-id');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth2callback');
    expect(url).toContain(`state=${state}`);
    expect(url).toContain('code_challenge=fake-code-challenge');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('access_type=offline');
  });
});

describe('GmailProvider — error handling', () => {
  it('handles rate limiting', async () => {
    fake.setRateLimit(true);
    const p = makeProvider(fake.createHttpClient())();
    await expect(p.fetchMessages(1)).rejects.toThrow();
  });
});
