/**
 * Credential isolation and account-service tests.
 *
 * The point of these tests is the security claim: a secret entered by the user
 * must not be reachable through an ordinary account read, an API-shaped
 * response, an export, a log line, or the UI view. Each of those paths is
 * asserted explicitly rather than assumed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from '../../database/src/index.js';
import { EmailAccountService } from './email-service.js';
import { CredentialStore, maskSecret, redactConfig, maskConfig, toPublicEmailAccount } from './credentials.js';

const TEST_DB = path.join(process.cwd(), 'data', 'test-phase6a-credentials.db');
const PASSWORD = 'correct-horse-battery-staple';

let db: Database;
let service: EmailAccountService;
let identityId: string;

async function freshDb(): Promise<void> {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  db = new Database(TEST_DB);
  await db.initialize();
  identityId = db.createIdentity({ email: 'owner@example.test', display_name: 'Owner' }).id;
  service = new EmailAccountService(db);
}

beforeEach(async () => {
  await freshDb();
});

afterEach(() => {
  try {
    db.close();
  } catch {
    /* already closed */
  }
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

function saveImapAccount(password = PASSWORD) {
  return service.saveAccount({
    identityId,
    providerType: 'imap',
    config: { host: 'imap.example.test', port: 993, user: 'owner@example.test', security: 'tls' },
    password,
  });
}

// ── Secret containment ───────────────────────────────────────────────────

describe('credential isolation', () => {
  it('never writes the password into the account config', () => {
    const account = saveImapAccount();
    const raw = db.getEmailAccountById(account.id)!;
    expect(raw.config).not.toContain(PASSWORD);
    expect(JSON.parse(raw.config)).not.toHaveProperty('password');
  });

  it('strips a password that a caller smuggled into the config object', () => {
    const account = service.saveAccount({
      identityId,
      providerType: 'imap',
      config: {
        host: 'imap.example.test',
        user: 'owner@example.test',
        // A caller passing a whole config must not be able to persist a secret.
        password: PASSWORD,
        clientSecret: 'another-secret',
      } as never,
    });
    const config = JSON.parse(db.getEmailAccountById(account.id)!.config);
    expect(config).not.toHaveProperty('password');
    expect(config).not.toHaveProperty('clientSecret');
  });

  it('stores the secret in its own table', () => {
    const account = saveImapAccount();
    const credential = db.getEmailCredentialByAccount(account.id)!;
    expect(credential.secret_value).toBe(PASSWORD);
    expect(credential.account_id).toBe(account.id);
  });

  it('does not leak the secret through the public account view', () => {
    const account = saveImapAccount();
    const rendered = JSON.stringify(account);
    expect(rendered).not.toContain(PASSWORD);
    expect(account.hasCredentials).toBe(true);
    expect(account.maskedSecret).toBe(maskSecret(PASSWORD));
  });

  it('does not leak the secret through the list-all path', () => {
    saveImapAccount();
    const rendered = JSON.stringify(service.getAllAccounts());
    expect(rendered).not.toContain(PASSWORD);
  });

  it('does not leak the secret through the by-identity path', () => {
    saveImapAccount();
    const rendered = JSON.stringify(service.getAccountsByIdentity(identityId));
    expect(rendered).not.toContain(PASSWORD);
  });

  it('does not leak the secret through the raw database row list', () => {
    saveImapAccount();
    const rendered = JSON.stringify(db.getAllEmailAccounts());
    expect(rendered).not.toContain(PASSWORD);
  });

  it('does not leak the secret into the activity log', () => {
    saveImapAccount();
    const rendered = JSON.stringify(db.getAllActivityLogs());
    expect(rendered).not.toContain(PASSWORD);
  });

  it('masks a short secret rather than revealing its length', () => {
    expect(maskSecret('abc')).toBe('••••••••');
    expect(maskSecret('')).toBe('');
  });

  it('redacts secret-shaped keys from a config', () => {
    expect(redactConfig({ host: 'h', password: 'p', accessToken: 't' })).toEqual({ host: 'h' });
  });

  it('keeps the key visible when masking a config', () => {
    expect(maskConfig({ host: 'h', password: 'p' })).toEqual({ host: 'h', password: '••••••••' });
  });

  it('tolerates a corrupt config string', () => {
    const account = db.createEmailAccount({ identity_id: identityId, provider_type: 'imap', config: 'not json' });
    const view = toPublicEmailAccount(db, account);
    expect(view.config).toEqual({});
  });
});

describe('CredentialStore', () => {
  it('round-trips a secret through resolveSecret', () => {
    const account = saveImapAccount();
    const store = new CredentialStore(db);
    expect(store.resolveSecret(account.id)!.secret).toBe(PASSWORD);
  });

  it('returns a mask, not the value, from getStored', () => {
    const account = saveImapAccount();
    const store = new CredentialStore(db);
    const stored = store.getStored(account.id)!;
    expect(stored.maskedSecret).toBe(maskSecret(PASSWORD));
    expect(JSON.stringify(stored)).not.toContain(PASSWORD);
  });

  it('replaces a secret in place, keeping the same reference', () => {
    const account = saveImapAccount();
    const store = new CredentialStore(db);
    const first = store.saveSecret(account.id, 'rotated-secret-value');
    const second = store.saveSecret(account.id, 'rotated-again-value');
    expect(second.credentialRef).toBe(first.credentialRef);
    expect(store.resolveSecret(account.id)!.secret).toBe('rotated-again-value');
  });

  it('refuses to store an empty secret', () => {
    const account = saveImapAccount();
    const store = new CredentialStore(db);
    expect(() => store.saveSecret(account.id, '')).toThrow();
  });

  it('reports hasSecret without revealing anything', () => {
    const account = saveImapAccount();
    const store = new CredentialStore(db);
    expect(store.hasSecret(account.id)).toBe(true);
    expect(store.getStored('no-such-account')).toBeNull();
  });

  it('cascades the secret away when the account is deleted', () => {
    const account = saveImapAccount();
    service.deleteAccount(account.id);
    expect(db.getEmailCredentialByAccount(account.id)).toBeNull();
    expect(db.getEmailAccountHealth(account.id)).toBeNull();
  });
});

// ── Config updates ───────────────────────────────────────────────────────

describe('account config updates', () => {
  it('merges a config patch without dropping existing fields', () => {
    const account = saveImapAccount();
    const updated = service.updateConfig(account.id, { mailbox: 'Archive' })!;
    expect(updated.config).toMatchObject({
      host: 'imap.example.test',
      mailbox: 'Archive',
    });
  });

  it('replaces the secret without changing the config', () => {
    const account = saveImapAccount();
    const updated = service.updateSecret(account.id, 'a-brand-new-password')!;
    expect(updated.config).toMatchObject({ host: 'imap.example.test' });
    expect(new CredentialStore(db).resolveSecret(account.id)!.secret).toBe('a-brand-new-password');
  });

  it('returns null for an unknown account', () => {
    expect(service.updateConfig('nope', { mailbox: 'X' })).toBeNull();
    expect(service.updateSecret('nope', 'x')).toBeNull();
    expect(service.getAccount('nope')).toBeNull();
  });
});

// ── Provider assembly ────────────────────────────────────────────────────

describe('provider assembly', () => {
  it('attaches the stored secret only to the provider, never to the account', () => {
    const account = saveImapAccount();
    const provider = service.buildProvider(account.id);
    // The provider can authenticate; the account view still cannot be read back.
    expect(provider.getConfig().password).toBe(PASSWORD);
    expect(JSON.stringify(service.getAccount(account.id))).not.toContain(PASSWORD);
  });

  it('routes a secret to the token field for oauth2 accounts', () => {
    const account = service.saveAccount({
      identityId,
      providerType: 'imap',
      config: { host: 'imap.example.test', user: 'owner@example.test', authMethod: 'oauth2' },
      password: 'ya29.some-access-token',
    });
    const provider = service.buildProvider(account.id);
    expect(provider.getConfig().accessToken).toBe('ya29.some-access-token');
    expect(provider.getConfig().password).toBeUndefined();
  });

  it('throws a clear error for an unknown account', () => {
    expect(() => service.buildProvider('nope')).toThrow('Unknown email account');
  });
});

// ── Mock provider remains the default path ───────────────────────────────

describe('mock provider remains the default', () => {
  it('creates a working mock account with no secret at all', async () => {
    const account = service.saveAccount({
      identityId,
      providerType: 'mock',
      config: { delay: 1 },
    });
    expect(account.hasCredentials).toBe(false);
    expect(account.maskedSecret).toBeNull();

    const provider = service.buildProvider(account.id);
    await expect(provider.connect()).resolves.toBe(true);
    const messages = await provider.fetchMessages();
    expect(messages.length).toBeGreaterThan(0);
    await provider.disconnect();
  });

  it('leaves health untouched until a check runs', () => {
    const account = service.saveAccount({ identityId, providerType: 'mock', config: {} });
    expect(service.getAccount(account.id)!.health.connectionStatus).toBe('disconnected');
    expect(service.getAccount(account.id)!.health.lastCheckedAt).toBeNull();
  });
});

// ── Connection test and health ───────────────────────────────────────────

describe('connection test and health recording', () => {
  it('reports a missing account instead of throwing', async () => {
    const result = await service.testConnection('does-not-exist');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CONFIG_INVALID');
  });

  it('records a failure as health and logs the attempt', async () => {
    // A provider with no usable host fails validation without any network I/O.
    const account = service.saveAccount({
      identityId,
      providerType: 'imap',
      config: { user: 'owner@example.test' },
      password: PASSWORD,
    });
    const result = await service.testConnection(account.id);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CONFIG_INVALID');

    const health = service.getAccount(account.id)!.health;
    expect(health.connectionStatus).toBe('error');
    expect(health.lastErrorCode).toBe('CONFIG_INVALID');
    expect(health.lastCheckedAt).not.toBeNull();

    const logged = db.getAllActivityLogs().find((l) => l.action === 'email_connection_tested');
    expect(logged).toBeTruthy();
    expect(logged!.details).not.toContain(PASSWORD);
  });

  it('records success for the mock provider', async () => {
    const account = service.saveAccount({ identityId, providerType: 'mock', config: {} });
    const result = await service.testConnection(account.id);
    expect(result.success).toBe(true);
    expect(service.getAccount(account.id)!.health.connectionStatus).toBe('connected');
  });
});
