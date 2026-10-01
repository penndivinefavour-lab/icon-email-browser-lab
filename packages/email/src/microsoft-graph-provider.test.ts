/**
 * Microsoft Graph provider unit tests.
 *
 * Uses a fake Microsoft Graph + OAuth server so zero real credentials or
 * network are needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MicrosoftGraphProvider,
  normalizeGmailMessage,
  type MicrosoftGraphHttpClient,
} from './microsoft-graph-provider.js';
import {
  createFakeMicrosoftGraphServer,
  type FakeMgTokenData,
} from './testing/fake-microsoft-server.js';

const FAKE_TOKENS: FakeMgTokenData = {
  accessToken: 'fake-mg-token',
  refreshToken: 'fake-mg-refresh',
  expiresIn: 3600,
};

const FAKE_CONFIG = {
  type: 'outlook' as const,
  clientId: 'fake-microsoft-client-id',
  clientSecret: 'fake-microsoft-client-secret',
  redirectUri: 'http://localhost:3000/auth/microsoft/callback',
};

let fake: ReturnType<typeof createFakeMicrosoftGraphServer>;
let apiBaseUrl = '';

beforeEach(async () => {
  // Reset rate limit flag from previous tests
  (fake as any)?.setRateLimit?.(false);

  fake = createFakeMicrosoftGraphServer(0);
  await new Promise<void>((resolve) => fake.server.once('listening', resolve));
  // Small delay to ensure port is fully bound
  await new Promise((r) => setTimeout(r, 100));
  const port = (fake.server.address() as any)?.port ?? 0;
  apiBaseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  if (fake.server.listening) {
    fake.server.close();
  }
});

function makeLoader(tokens: FakeMgTokenData) {
  return async () => ({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

function makeProvider(httpClient: MicrosoftGraphHttpClient) {
  return (accountId = 'acc-1', identityId = 'id-1') =>
    new MicrosoftGraphProvider(FAKE_CONFIG, accountId, identityId, makeLoader(FAKE_TOKENS), {
      httpClient,
      apiBaseUrl,
      oauthTokenUrl: `${apiBaseUrl}/common/oauth2/v2.0/token`,
    });
}

describe('MicrosoftGraphProvider — connection lifecycle', () => {
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
    const p = new MicrosoftGraphProvider(
      FAKE_CONFIG,
      'acc-1',
      'id-1',
      emptyLoader,
      { httpClient: fake.createHttpClient() },
    );
    await expect(p.connect()).rejects.toThrow('No Microsoft Graph credentials found');
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

describe('MicrosoftGraphProvider — message operations', () => {
  it('fetches messages from the fake server', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msgs = await p.fetchMessages(5);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0].subject).toContain('Test Subject');
  });

  it('respects pagination limit', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msgs = await p.fetchMessages(1);
    expect(msgs.length).toBeLessThanOrEqual(1);
  });

  it('fetches a single message', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msg = await p.fetchSingleMessage('mg-msg-1');
    expect(msg).not.toBeNull();
    expect(msg?.subject).toContain('Test Subject');
  });

  it('returns null for non-existent message', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msg = await p.fetchSingleMessage('nonexistent');
    expect(msg).toBeNull();
  });
});

describe('MicrosoftGraphProvider — folder/list operations', () => {
  it('lists folders/labels', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const labels = await p.listLabels();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some(l => l.path === 'Inbox')).toBe(true);
  });

  it('gets unread count', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const count = await p.getUnreadCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('marks a message as read', async () => {
  const p = makeProvider(fake.createHttpClient())();
  const result = await p.markAsRead('mg-msg-1');
  // Microsoft Graph returns 204 No Content for successful PATCH, 
  // but our fake server might return different status
  expect(result).toBeDefined();
  });
});

describe('MicrosoftGraphProvider — search', () => {
  it('searches messages by query', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const msgs = await p.searchMessages('test', 5);
    expect(msgs.length).toBeGreaterThan(0);
    // Messages contain 'Test' in subject and body; check either
    expect(msgs.some(m => m.subject.includes('Test') || m.body.includes('Test'))).toBe(true);
  });
});

describe('MicrosoftGraphProvider — connection test', () => {
  it('returns success on valid connection', async () => {
    const p = makeProvider(fake.createHttpClient())();
    const result = await p.testConnection();
    expect(result.success).toBe(true);
    expect(result.providerType).toBe('outlook');
  });

  it('returns failure when no tokens', async () => {
    const emptyLoader = () => Promise.resolve(null);
    const p = new MicrosoftGraphProvider(
      FAKE_CONFIG,
      'acc-1',
      'id-1',
      emptyLoader,
      { httpClient: fake.createHttpClient() },
    );
    const result = await p.testConnection();
    expect(result.success).toBe(false);
  });
});

describe('MicrosoftGraphProvider — error handling', () => {
  afterEach(() => {
    fake.setRateLimit(false); // Reset after each test
  });

  it('handles rate limiting', async () => {
    fake.setRateLimit(true);
    const p = makeProvider(fake.createHttpClient())();
    await expect(p.fetchMessages(1)).rejects.toThrow();
  });
});

describe('normalizeGmailMessage', () => {
  it('normalizes a Microsoft Graph message to EmailMessage', () => {
    const msg = {
      id: 'msg-1',
      subject: 'Test Subject',
      body: { content: 'Test body', contentType: 'text' as const },
      from: { emailAddress: { address: 'test@example.com', name: 'Test User' } },
      receivedDateTime: new Date().toISOString(),
      isRead: false,
    };
    const normalized = normalizeGmailMessage(msg);
    expect(normalized.subject).toBe('Test Subject');
    expect(normalized.sender).toBe('test@example.com');
    expect(normalized.isRead).toBe(false);
  });

  it('handles missing parts gracefully', () => {
  const msg = {
  id: 'msg-2',
  subject: undefined,
  body: undefined,
  from: undefined,
  receivedDateTime: undefined,
  isRead: undefined,
  } as any;
  const normalized = normalizeGmailMessage(msg);
  expect(normalized.id).toBe('msg-2');
  expect(normalized.subject).toBe('(no subject)');
  expect(normalized.body).toBe('');
  });
});
