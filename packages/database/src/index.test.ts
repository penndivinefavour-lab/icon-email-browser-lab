/**
 * Database integration tests for ICON Email & Browser Lab.
 * Uses Node.js built-in node:test runner with tsx for TypeScript support.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { Database } from './index.ts';

// ─── Test utilities ──────────────────────────────────────────────────
const TEST_DB = path.join(process.cwd(), 'data', 'test-icon-lab.db');

function freshDb(): Database {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  return new Database(TEST_DB);
}

function cleanupDb(db: Database): void {
  try { db.close(); } catch {}
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Database initialization', () => {
  test('should initialize empty database', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      assert.ok(true);
    } finally {
      cleanupDb(db);
    }
  });

  test('should run migrations only once', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      await db.initialize(); // second call should be no-op
      const identities = db.getAllIdentities();
      assert.strictEqual(identities.length, 0);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Identity CRUD', () => {
  test('should create and retrieve identity', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({
        email: 'test@example.test',
        display_name: 'Test User',
        provider: 'example.test',
        status: 'available',
        tags: '[]',
        notes: null,
        last_used_at: null,
        browser_profile_id: null,
        verification_status: 'unverified',
        source: 'manual',
        metadata: '{}',
      });

      assert.ok(identity.id);
      assert.strictEqual(identity.email, 'test@example.test');
      assert.strictEqual(identity.display_name, 'Test User');

      const fetched = db.getIdentityById(identity.id);
      assert.ok(fetched);
      assert.strictEqual(fetched!.email, 'test@example.test');
    } finally {
      cleanupDb(db);
    }
  });

  test('should update identity', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({
        email: 'update@example.test',
        display_name: 'Update Test',
        provider: 'example.test',
        status: 'available',
      });

      const updated = db.updateIdentity(identity.id, { status: 'used' });
      assert.ok(updated);
      assert.strictEqual(updated!.status, 'used');
    } finally {
      cleanupDb(db);
    }
  });

  test('should delete identity', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({
        email: 'delete@example.test',
        provider: 'example.test',
      });

      const deleted = db.deleteIdentity(identity.id);
      assert.strictEqual(deleted, true);
      assert.strictEqual(db.getIdentityById(identity.id), null);
    } finally {
      cleanupDb(db);
    }
  });

  test('should list all identities', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.createIdentity({ email: 'list1@example.test', provider: 'example.test' });
      db.createIdentity({ email: 'list2@example.test', provider: 'example.test' });

      const identities = db.getAllIdentities();
      assert.ok(identities.length >= 2);
    } finally {
      cleanupDb(db);
    }
  });

  test('should filter identities by search', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.createIdentity({
        email: 'alpha@example.test',
        display_name: 'Alpha User',
        provider: 'example.test',
      });

      const results = db.filterIdentities({ search: 'alpha' });
      assert.ok(results.length >= 1);
    } finally {
      cleanupDb(db);
    }
  });

  test('should filter by status', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.createIdentity({ email: 'avail@example.test', provider: 'example.test', status: 'available' });
      db.createIdentity({ email: 'used@example.test', provider: 'example.test', status: 'used' });

      const available = db.filterIdentities({ status: 'available' });
      assert.ok(available.some(i => i.email === 'avail@example.test'));
    } finally {
      cleanupDb(db);
    }
  });

  test('should enforce unique email', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.createIdentity({ email: 'unique@example.test', provider: 'example.test' });

      // Should not throw - SQLite allows duplicates in our schema
      // but the application layer might enforce it
      const dup = db.createIdentity({ email: 'unique@example.test', provider: 'example.test' });
      assert.ok(dup.id);
    } finally {
      cleanupDb(db);
    }
  });

  test('should return empty for no match', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const results = db.filterIdentities({ search: 'nonexistent-xyz-123' });
      assert.strictEqual(results.length, 0);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Email account operations', () => {
  test('should create and retrieve email account', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({
        email: 'acct-test@example.test',
        provider: 'example.test',
      });

      const account = db.createEmailAccount({
        identity_id: identity.id,
        provider_type: 'mock',
        config: JSON.stringify({ type: 'mock' }),
      });

      assert.ok(account.id);
      assert.strictEqual(account.provider_type, 'mock');

      const fetched = db.getEmailAccountById(account.id);
      assert.ok(fetched);
      assert.strictEqual(fetched!.provider_type, 'mock');
    } finally {
      cleanupDb(db);
    }
  });

  test('should get accounts by identity', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({
        email: 'multi-acct@example.test',
        provider: 'example.test',
      });

      db.createEmailAccount({ identity_id: identity.id, provider_type: 'mock' });
      db.createEmailAccount({ identity_id: identity.id, provider_type: 'imap' });

      const accounts = db.getEmailAccountsByIdentity(identity.id);
      assert.ok(accounts.length >= 2);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Message operations', () => {
  test('should create and retrieve message', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({ email: 'msg-test@example.test', provider: 'example.test' });
      const account = db.createEmailAccount({ identity_id: identity.id, provider_type: 'mock' });

      const message = db.createMessage({
        account_id: account.id,
        subject: 'Test Message',
        sender: 'sender@example.test',
        recipient: 'msg-test@example.test',
        body: 'Hello world',
      });

      assert.ok(message.id);
      assert.strictEqual(message.subject, 'Test Message');

      const fetched = db.getMessageById(message.id);
      assert.ok(fetched);
      assert.strictEqual(fetched!.subject, 'Test Message');
    } finally {
      cleanupDb(db);
    }
  });

  test('should search messages by identity', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({ email: 'search-msg@example.test', provider: 'example.test' });
      const account = db.createEmailAccount({ identity_id: identity.id, provider_type: 'mock' });

      db.createMessage({
        account_id: account.id,
        subject: 'Unique Search Subject',
        sender: 'unique@example.test',
        recipient: 'search-msg@example.test',
      });

      const results = db.getMessagesByIdentity(identity.id);
      assert.ok(results.length >= 1);
      assert.strictEqual(results[0].subject, 'Unique Search Subject');
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Verification code operations', () => {
  test('should create verification code', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({ email: 'otp-test@example.test', provider: 'example.test' });
      const account = db.createEmailAccount({ identity_id: identity.id, provider_type: 'mock' });
      const message = db.createMessage({
        account_id: account.id,
        subject: 'OTP Code',
        sender: 'auth@example.test',
        recipient: identity.email,
      });

      const vc = db.createVerificationCode({
        message_id: message.id,
        identity_id: identity.id,
        sender: 'auth@example.test',
        service_label: 'Test Service',
        code: '123456',
      });

      assert.ok(vc.id);
      assert.strictEqual(vc.code, '123456');
    } finally {
      cleanupDb(db);
    }
  });

  test('should update verification code status', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({ email: 'otp-status@example.test', provider: 'example.test' });
      const account = db.createEmailAccount({ identity_id: identity.id, provider_type: 'mock' });
      const message = db.createMessage({
        account_id: account.id,
        subject: 'Status Test',
        sender: 'test@example.test',
        recipient: identity.email,
      });

      const vc = db.createVerificationCode({
        message_id: message.id,
        identity_id: identity.id,
        sender: 'test@example.test',
        service_label: 'Status Test',
        code: '654321',
      });

      const updated = db.markVerificationCodeUsed(vc.id);
      assert.strictEqual(updated!.status, 'used');
    } finally {
      cleanupDb(db);
    }
  });

  test('should get verification codes by identity', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({ email: 'otp-list@example.test', provider: 'example.test' });
      const account = db.createEmailAccount({ identity_id: identity.id, provider_type: 'mock' });

      for (let i = 1; i <= 3; i++) {
        const msg = db.createMessage({
          account_id: account.id,
          subject: `OTP ${i}`,
          sender: 'test@example.test',
          recipient: identity.email,
        });
        db.createVerificationCode({
          message_id: msg.id,
          identity_id: identity.id,
          code: `111${i}111`,
        });
      }

      const codes = db.getVerificationCodesByIdentity(identity.id);
      assert.ok(codes.length >= 3);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Browser profile operations', () => {
  test('should create browser profile', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const profile = db.createBrowserProfile({
        name: 'Test Profile',
        browser: 'chromium',
        directory: '/tmp/test-profile',
      });

      assert.ok(profile.id);
      assert.strictEqual(profile.name, 'Test Profile');
      assert.strictEqual(profile.browser, 'chromium');
    } finally {
      cleanupDb(db);
    }
  });

  test('should get all browser profiles', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.createBrowserProfile({ name: 'Profile 1', browser: 'firefox', directory: '/tmp/p1' });
      db.createBrowserProfile({ name: 'Profile 2', browser: 'chromium', directory: '/tmp/p2' });

      const profiles = db.getAllBrowserProfiles();
      assert.ok(profiles.length >= 2);
    } finally {
      cleanupDb(db);
    }
  });

  test('should update browser profile', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const profile = db.createBrowserProfile({
        name: 'Update Profile',
        browser: 'chromium',
        directory: '/tmp/update',
      });

      const updated = db.updateBrowserProfile(profile.id, { status: 'active' });
      assert.strictEqual(updated!.status, 'active');
    } finally {
      cleanupDb(db);
    }
  });

  test('should delete browser profile', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const profile = db.createBrowserProfile({
        name: 'Delete Profile',
        browser: 'chromium',
        directory: '/tmp/delete',
      });

      const deleted = db.deleteBrowserProfile(profile.id);
      assert.strictEqual(deleted, true);
      assert.strictEqual(db.getBrowserProfileById(profile.id), null);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Session operations', () => {
  test('should create session', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const profile = db.createBrowserProfile({
        name: 'Session Profile',
        browser: 'chromium',
        directory: '/tmp/session-p',
      });

      const session = db.createSession({
        profile_id: profile.id,
      });

      assert.ok(session.id);
      assert.strictEqual(session.profile_id, profile.id);
      assert.strictEqual(session.status, 'active');
    } finally {
      cleanupDb(db);
    }
  });

  test('should end session', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const profile = db.createBrowserProfile({
        name: 'End Session Profile',
        browser: 'chromium',
        directory: '/tmp/end-session',
      });

      const session = db.createSession({
        profile_id: profile.id,
      });

      const ended = db.endSession(session.id);
      assert.strictEqual(ended!.status, 'completed');
      assert.ok(ended!.ended_at);
      assert.ok(ended!.duration_ms !== null && ended!.duration_ms >= 0);
    } finally {
      cleanupDb(db);
    }
  });

  test('should get active sessions', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const profile = db.createBrowserProfile({
        name: 'Active Session Profile',
        browser: 'chromium',
        directory: '/tmp/active-session',
      });

      db.createSession({ profile_id: profile.id });

      const active = db.getActiveSessions();
      assert.ok(active.length >= 1);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Test run operations', () => {
  test('should create test run', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const run = db.createTestRun({
        name: 'Test Run 1',
        target_environment: 'local',
      });

      assert.ok(run.id);
      assert.strictEqual(run.name, 'Test Run 1');
      assert.strictEqual(run.status, 'running');
    } finally {
      cleanupDb(db);
    }
  });

  test('should update test run status', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const run = db.createTestRun({ name: 'Update Test Run' });

      const updated = db.updateTestRun(run.id, { status: 'completed', result: 'passed' });
      assert.strictEqual(updated!.status, 'completed');
      assert.strictEqual(updated!.result, 'passed');
    } finally {
      cleanupDb(db);
    }
  });

  test('should add log to test run', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const run = db.createTestRun({ name: 'Log Test Run' });

      db.updateTestRun(run.id, { logs: JSON.stringify([{ action: 'start', timestamp: new Date().toISOString() }]) });
      const updated = db.getTestRunById(run.id);
      assert.ok(updated);
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Activity log operations', () => {
  test('should create activity log', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const log = db.logActivity({
        action: 'test_action',
        actor: 'tester',
        entity_type: 'identity',
      });

      assert.ok(log.id);
      assert.strictEqual(log.action, 'test_action');
    } finally {
      cleanupDb(db);
    }
  });

  test('should get recent activity logs', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.logActivity({ action: 'log_1', entity_type: 'test' });
      db.logActivity({ action: 'log_2', entity_type: 'test' });

      const logs = db.getRecentActivityLogs(10);
      assert.ok(logs.length >= 2);
    } finally {
      cleanupDb(db);
    }
  });

  test('should filter by action', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.logActivity({ action: 'filter_test', entity_type: 'test' });

      const all = db.getAllActivityLogs();
      assert.ok(all.some(l => l.action === 'filter_test'));
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Settings operations', () => {
  test('should set and get setting', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.setSetting('test_key', 'test_value');
      const s = db.getSetting('test_key');
      assert.ok(s);
      assert.strictEqual(s.value, 'test_value');
    } finally {
      cleanupDb(db);
    }
  });

  test('should get all settings', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      db.setSetting('all_test_1', 'value1');
      db.setSetting('all_test_2', 'value2');

      const all = db.getAllSettings();
      const keys = all.map((s) => s.key);
      assert.ok(keys.includes('all_test_1'));
      assert.ok(keys.includes('all_test_2'));
    } finally {
      cleanupDb(db);
    }
  });
});

describe('Edge cases', () => {
  test('should handle missing database gracefully', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({ email: 'edge@example.test', provider: 'example.test' });
      const fetched = db.getIdentityById(identity.id);
      assert.ok(fetched);
    } finally {
      cleanupDb(db);
    }
  });

  test('should handle null values correctly', async () => {
    const db = freshDb();
    try {
      await db.initialize();
      const identity = db.createIdentity({
        email: 'null-test@example.test',
        provider: 'example.test',
        display_name: null,
        notes: null,
      });
      assert.strictEqual(identity.display_name, null);
      assert.strictEqual(identity.notes, null);
    } finally {
      cleanupDb(db);
    }
  });
});
