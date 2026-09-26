#!/usr/bin/env tsx
/**
 * Test runner for ICON Email & Browser Lab.
 * Uses Node.js built-in test runner + tsx for TypeScript support.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { Database } from './index.ts';
import {
  exportIdentitiesToCSV,
  parseIdentityCSV,
  generateTestIdentities,
} from '../../shared/src/csv.ts';
import path from 'path';
import fs from 'fs';

const testDbPath = path.join(process.cwd(), 'data', 'test-icon-lab.db');

// Helper: create a fresh DB for each test
function freshDb(): Database {
  const db = new Database(testDbPath);
  return db;
}

// Helper: clean up test DB
function cleanupDb(db: Database): void {
  db.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {
    /* ignore */
  }
}

// ───────────── Identity CRUD ─────────────

test('should create an identity', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'test-create@example.test',
      display_name: 'Test Create',
      provider: 'example.test',
      status: 'available',
      tags: JSON.stringify(['test']),
      notes: 'Test identity for CRUD',
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: JSON.stringify({}),
    });

    assert.ok(identity);
    assert.ok(identity.id);
    assert.strictEqual(identity.email, 'test-create@example.test');
    assert.strictEqual(identity.status, 'available');
  } finally {
    cleanupDb(db);
  }
});

test('should get identity by id', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const created = db.createIdentity({
      email: 'test-get@example.test',
      display_name: 'Test Get',
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

    const fetched = db.getIdentityById(created.id);
    assert.ok(fetched);
    assert.strictEqual(fetched!.email, 'test-get@example.test');
  } finally {
    cleanupDb(db);
  }
});

test('should update identity', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const created = db.createIdentity({
      email: 'test-update@example.test',
      display_name: 'Test Update',
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

    const updated = db.updateIdentity(created.id, {
      status: 'used',
      display_name: 'Updated Name',
    });

    assert.ok(updated);
    assert.strictEqual(updated!.status, 'used');
    assert.strictEqual(updated!.display_name, 'Updated Name');
  } finally {
    cleanupDb(db);
  }
});

test('should delete identity', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const created = db.createIdentity({
      email: 'test-delete@example.test',
      display_name: 'Test Delete',
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

    const deleted = db.deleteIdentity(created.id);
    assert.strictEqual(deleted, true);

    const fetched = db.getIdentityById(created.id);
    assert.strictEqual(fetched, null);
  } finally {
    cleanupDb(db);
  }
});

test('should get all identities', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'test-all-1@example.test',
      display_name: 'Test All 1',
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

    db.createIdentity({
      email: 'test-all-2@example.test',
      display_name: 'Test All 2',
      provider: 'example.test',
      status: 'used',
      tags: '[]',
      notes: null,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const all = db.getAllIdentities();
    assert.ok(all.length >= 2);
  } finally {
    cleanupDb(db);
  }
});

test('should enforce unique email', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'unique@example.test',
      display_name: 'Unique',
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

    assert.throws(() => {
      db.createIdentity({
        email: 'unique@example.test',
        display_name: 'Duplicate',
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
    });
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Identity Filtering ─────────────

test('should filter by status', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'filter-available@example.test',
      display_name: 'Filter Available',
      provider: 'example.test',
      status: 'available',
      tags: JSON.stringify(['filter']),
      notes: null,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    db.createIdentity({
      email: 'filter-used@example.test',
      display_name: 'Filter Used',
      provider: 'example.test',
      status: 'used',
      tags: JSON.stringify(['filter']),
      notes: null,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const available = db.filterIdentities({ status: 'available' });
    assert.ok(available.length >= 1);
    assert.ok(available.every((i) => i.status === 'available'));
  } finally {
    cleanupDb(db);
  }
});

test('should filter by provider', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'filter-available@example.test',
      display_name: 'Filter Available',
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

    db.createIdentity({
      email: 'filter-other@example.test',
      display_name: 'Filter Other',
      provider: 'other.test',
      status: 'available',
      tags: '[]',
      notes: null,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const exampleTest = db.filterIdentities({ provider: 'example.test' });
    assert.ok(exampleTest.length >= 1);
    assert.ok(exampleTest.every((i) => i.provider === 'example.test'));
  } finally {
    cleanupDb(db);
  }
});

test('should filter by search query', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'search-test@example.test',
      display_name: 'Search Test',
      provider: 'example.test',
      status: 'available',
      tags: '[]',
      notes: 'Contains keyword',
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const results = db.filterIdentities({ search: 'keyword' });
    assert.ok(results.length >= 1);
  } finally {
    cleanupDb(db);
  }
});

test('should combine filters', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'combo-test@example.test',
      display_name: 'Combo Test',
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

    const combined = db.filterIdentities({
      status: 'available',
      provider: 'example.test',
    });
    assert.ok(combined.length >= 1);
    combined.forEach((i) => {
      assert.strictEqual(i.status, 'available');
      assert.strictEqual(i.provider, 'example.test');
    });
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Identity Search ─────────────

test('should search by email', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'search-alpha@example.test',
      display_name: 'Search Alpha',
      provider: 'example.test',
      status: 'available',
      tags: '[]',
      notes: 'Test note',
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const results = db.searchIdentities('alpha');
    assert.ok(results.length >= 1);
  } finally {
    cleanupDb(db);
  }
});

test('should search by display name', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'search-display@example.test',
      display_name: 'Search Display',
      provider: 'example.test',
      status: 'available',
      tags: '[]',
      notes: 'Test note',
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const results = db.searchIdentities('Display');
    assert.ok(results.length >= 1);
  } finally {
    cleanupDb(db);
  }
});

test('should return empty for no match', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'nomatch@example.test',
      display_name: 'No Match',
      provider: 'example.test',
      status: 'available',
      tags: '[]',
      notes: 'Some note',
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const results = db.searchIdentities('nonexistent-xyz-123');
    assert.strictEqual(results.length, 0);
  } finally {
    cleanupDb(db);
  }
});

// ───────────── CSV Import/Export ─────────────

test('should export identities to CSV', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createIdentity({
      email: 'csv-export@example.test',
      display_name: 'CSV Export',
      provider: 'example.test',
      status: 'available',
      tags: JSON.stringify(['csv']),
      notes: 'Test CSV export',
      last_used_at: null,
      browser_profile_id: null,
      verification_status: 'unverified',
      source: 'manual',
      metadata: '{}',
    });

    const identities = db.getAllIdentities();
    const csv = exportIdentitiesToCSV(identities);

    assert.ok(csv.includes('email'));
    assert.ok(csv.includes('csv-export@example.test'));
    assert.ok(csv.includes('CSV Export'));
  } finally {
    cleanupDb(db);
  }
});

test('should parse identity CSV', async () => {
  const csvContent =
    'email,display_name,provider,status,tags,notes,source,verification_status\n' +
    'test-import-1@example.test,Import One,example.test,available,"[""import""]",Imported note,imported,unverified\n' +
    'test-import-2@example.test,Import Two,example.test,used,"[""import""]",Another note,imported,verified';

  const rows = parseIdentityCSV(csvContent);

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].email, 'test-import-1@example.test');
  assert.strictEqual(rows[0].display_name, 'Import One');
  assert.strictEqual(rows[1].email, 'test-import-2@example.test');
});

test('should generate test identities', async () => {
  const identities = generateTestIdentities(5);

  assert.strictEqual(identities.length, 5);
  assert.strictEqual(identities[0].email, 'test-user-000001@example.test');
  assert.strictEqual(identities[4].email, 'test-user-000005@example.test');
  identities.forEach((id) => {
    assert.strictEqual(id.status, 'available');
    assert.strictEqual(id.source, 'generated');
  });
});

test('should handle empty CSV', async () => {
  const rows = parseIdentityCSV('');
  assert.strictEqual(rows.length, 0);
});

// ───────────── Email Account ─────────────

test('should create and retrieve email account', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'acct-test@example.test',
      display_name: 'Account Test',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: JSON.stringify({ type: 'mock' }),
      is_active: 1,
      last_synced_at: null,
    });

    assert.ok(account.id);

    const fetched = db.getEmailAccountById(account.id);
    assert.ok(fetched);
    assert.strictEqual(fetched!.provider_type, 'mock');

    const byIdentity = db.getEmailAccountByIdentityId(identity.id);
    assert.ok(byIdentity);
    assert.strictEqual(byIdentity!.identity_id, identity.id);
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Messages ─────────────

test('should create and retrieve message', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'msg-test@example.test',
      display_name: 'Message Test',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    const message = db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-001',
      subject: 'Test Message',
      sender: 'sender@example.test',
      recipient: 'msg-test@example.test',
      body: 'This is a test message body',
      body_html: '<p>This is a test message body</p>',
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
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

test('should get messages by account', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'msg-list@example.test',
      display_name: 'Message List',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-002',
      subject: 'Message Two',
      sender: 'two@example.test',
      recipient: 'msg-list@example.test',
      body: 'Body two',
      body_html: null,
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
    });

    db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-003',
      subject: 'Message Three',
      sender: 'three@example.test',
      recipient: 'msg-list@example.test',
      body: 'Body three',
      body_html: null,
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
    });

    const messages = db.getMessagesByAccount(account.id);
    assert.ok(messages.length >= 2);
  } finally {
    cleanupDb(db);
  }
});

test('should mark message as read', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'read-test@example.test',
      display_name: 'Read Test',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    const message = db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-read-001',
      subject: 'Unread Test',
      sender: 'test@example.test',
      recipient: 'read-test@example.test',
      body: 'Test body',
      body_html: null,
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
    });

    db.markMessageRead(message.id, true);
    const updated = db.getMessageById(message.id);
    assert.strictEqual(updated!.is_read, 1);
  } finally {
    cleanupDb(db);
  }
});

test('should search messages', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'search-msg@example.test',
      display_name: 'Search Msg',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-search-001',
      subject: 'Unique Search Subject',
      sender: 'unique@example.test',
      recipient: 'search-msg@example.test',
      body: 'Unique body content',
      body_html: null,
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
    });

    const results = db.searchMessages('Unique Search Subject');
    assert.ok(results.length >= 1);
    assert.strictEqual(results[0].subject, 'Unique Search Subject');
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Verification Codes ─────────────

test('should create verification code', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'otp-test@example.test',
      display_name: 'OTP Test',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    const message = db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-otp-001',
      subject: 'OTP Code',
      sender: 'auth@example.test',
      recipient: 'otp-test@example.test',
      body: 'Your code is: 123456',
      body_html: null,
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
    });

    const vc = db.createVerificationCode({
      message_id: message.id,
      identity_id: identity.id,
      sender: 'auth@example.test',
      service_label: 'Test Service',
      code: '123456',
      code_type: 'otp',
      received_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
      status: 'detected',
      notes: null,
    });

    assert.ok(vc.id);
    assert.strictEqual(vc.code, '123456');
    assert.strictEqual(vc.status, 'detected');

    const fetched = db.getVerificationCodeById(vc.id);
    assert.ok(fetched);
    assert.strictEqual(fetched!.code, '123456');
  } finally {
    cleanupDb(db);
  }
});

test('should update verification code status', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'otp-status@example.test',
      display_name: 'OTP Status',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    const message = db.createMessage({
      account_id: account.id,
      message_id_external: 'ext-status-001',
      subject: 'Status OTP',
      sender: 'test@example.test',
      recipient: 'otp-status@example.test',
      body: 'Code: 654321',
      body_html: null,
      received_at: new Date().toISOString(),
      is_read: 0,
      attachments: '[]',
      raw_headers: null,
    });

    const vc = db.createVerificationCode({
      message_id: message.id,
      identity_id: identity.id,
      sender: 'test@example.test',
      service_label: 'Status Test',
      code: '654321',
      code_type: 'otp',
      received_at: new Date().toISOString(),
      expires_at: null,
      status: 'detected',
      notes: null,
    });

    const updated = db.updateVerificationCodeStatus(vc.id, 'used');
    assert.strictEqual(updated!.status, 'used');
  } finally {
    cleanupDb(db);
  }
});

test('should get verification codes by identity', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const identity = db.createIdentity({
      email: 'otp-list@example.test',
      display_name: 'OTP List',
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

    const account = db.createEmailAccount({
      identity_id: identity.id,
      provider_type: 'mock',
      config: '{}',
      is_active: 1,
      last_synced_at: null,
    });

    for (let i = 1; i <= 3; i++) {
      const message = db.createMessage({
        account_id: account.id,
        message_id_external: `ext-list-${i}`,
        subject: `OTP ${i}`,
        sender: 'test@example.test',
        recipient: 'otp-list@example.test',
        body: `Code ${i}: 111${i}111`,
        body_html: null,
        received_at: new Date().toISOString(),
        is_read: 0,
        attachments: '[]',
        raw_headers: null,
      });

      db.createVerificationCode({
        message_id: message.id,
        identity_id: identity.id,
        sender: 'test@example.test',
        service_label: `Service ${i}`,
        code: `111${i}111`,
        code_type: 'otp',
        received_at: new Date().toISOString(),
        expires_at: null,
        status: 'detected',
        notes: null,
      });
    }

    const codes = db.getVerificationCodesByIdentity(identity.id);
    assert.ok(codes.length >= 3);
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Browser Profiles ─────────────

test('should create browser profile', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const profile = db.createBrowserProfile({
      name: 'Test Profile',
      browser: 'chromium',
      directory: '/tmp/test-profile',
      identity_id: null,
      status: 'inactive',
      last_launched_at: null,
      last_closed_at: null,
      notes: 'Test profile for CRUD',
    });

    assert.ok(profile.id);
    assert.strictEqual(profile.name, 'Test Profile');
    assert.strictEqual(profile.browser, 'chromium');
    assert.strictEqual(profile.status, 'inactive');
  } finally {
    cleanupDb(db);
  }
});

test('should get all browser profiles', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createBrowserProfile({
      name: 'Profile All 1',
      browser: 'firefox',
      directory: '/tmp/p1',
      identity_id: null,
      status: 'inactive',
      last_launched_at: null,
      last_closed_at: null,
      notes: null,
    });

    db.createBrowserProfile({
      name: 'Profile All 2',
      browser: 'chromium',
      directory: '/tmp/p2',
      identity_id: null,
      status: 'active',
      last_launched_at: new Date().toISOString(),
      last_closed_at: null,
      notes: null,
    });

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
      identity_id: null,
      status: 'inactive',
      last_launched_at: null,
      last_closed_at: null,
      notes: null,
    });

    const updated = db.updateBrowserProfile(profile.id, {
      status: 'active',
      notes: 'Updated notes',
    });

    assert.strictEqual(updated!.status, 'active');
    assert.strictEqual(updated!.notes, 'Updated notes');
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
      identity_id: null,
      status: 'inactive',
      last_launched_at: null,
      last_closed_at: null,
      notes: null,
    });

    const deleted = db.deleteBrowserProfile(profile.id);
    assert.strictEqual(deleted, true);

    const fetched = db.getBrowserProfileById(profile.id);
    assert.strictEqual(fetched, null);
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Sessions ─────────────

test('should create session', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const profile = db.createBrowserProfile({
      name: 'Session Profile',
      browser: 'chromium',
      directory: '/tmp/session-p',
      identity_id: null,
      status: 'active',
      last_launched_at: new Date().toISOString(),
      last_closed_at: null,
      notes: null,
    });

    const session = db.createSession({
      profile_id: profile.id,
      identity_id: null as string | null,
      started_at: new Date().toISOString(),
      ended_at: null as string | null,
      duration_ms: null as number | null,
      status: 'active',
      test_run_id: null as string | null,
      notes: 'Test session',
    });

    assert.ok(session.id);
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
      identity_id: null,
      status: 'active',
      last_launched_at: new Date().toISOString(),
      last_closed_at: null,
      notes: null,
    });

    const session = db.createSession({
      profile_id: profile.id,
      identity_id: null,
      started_at: new Date(Date.now() - 10000).toISOString(),
      ended_at: null as string | null,
      duration_ms: null as number | null,
      status: 'active',
      test_run_id: null as string | null,
      notes: null as string | null,
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
      identity_id: null,
      status: 'active',
      last_launched_at: new Date().toISOString(),
      last_closed_at: null,
      notes: null,
    });

    db.createSession({
      profile_id: profile.id,
      identity_id: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_ms: null,
      status: 'active',
      test_run_id: null,
      notes: null,
    });

    const active = db.getActiveSessions();
    assert.ok(active.length >= 1);
    assert.ok(active.every((s) => s.status === 'active'));
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Test Runs ─────────────

test('should create test run', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const run = db.createTestRun({
      name: 'Test Run Lifecycle',
      target_environment: 'local',
      profile_id: null,
      identity_id: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'queued',
      logs: '[]',
      screenshots: '[]',
      result: null,
    });

    assert.ok(run.id);
    assert.strictEqual(run.name, 'Test Run Lifecycle');
    assert.strictEqual(run.status, 'queued');
  } finally {
    cleanupDb(db);
  }
});

test('should update test run status', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const run = db.createTestRun({
      name: 'Status Update Test',
      target_environment: 'local',
      profile_id: null,
      identity_id: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'queued',
      logs: '[]',
      screenshots: '[]',
      result: null,
    });

    const updated = db.updateTestRunStatus(run.id, 'running');
    assert.strictEqual(updated!.status, 'running');

    const completed = db.updateTestRunStatus(run.id, 'passed', 'passed');
    assert.strictEqual(completed!.status, 'passed');
    assert.strictEqual(completed!.result, 'passed');
  } finally {
    cleanupDb(db);
  }
});

test('should add log to test run', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const run = db.createTestRun({
      name: 'Log Test',
      target_environment: 'local',
      profile_id: null,
      identity_id: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'queued',
      logs: '[]',
      screenshots: '[]',
      result: null,
    });

    db.addTestRunLog(run.id, 'Test log entry 1');
    db.addTestRunLog(run.id, 'Test log entry 2');

    const updated = db.getTestRunById(run.id);
    const logs = JSON.parse(updated!.logs) as string[];
    assert.strictEqual(logs.length, 2);
    assert.strictEqual(logs[0], 'Test log entry 1');
  } finally {
    cleanupDb(db);
  }
});

test('should get all test runs', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createTestRun({
      name: 'All Runs Test 1',
      target_environment: 'local',
      profile_id: null,
      identity_id: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'queued',
      logs: '[]',
      screenshots: '[]',
      result: null,
    });

    db.createTestRun({
      name: 'All Runs Test 2',
      target_environment: 'local',
      profile_id: null,
      identity_id: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'passed',
      logs: '[]',
      screenshots: '[]',
      result: 'passed',
    });

    const runs = db.getAllTestRuns();
    assert.ok(runs.length >= 2);
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Activity Logs ─────────────

test('should create activity log', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    const log = db.createActivityLog({
      action: 'identity_created',
      entity: 'identity',
      entity_id: 'test-log-id',
      actor: 'system',
      result: 'success',
      details: JSON.stringify({ email: 'log-test@example.test' }),
    });

    assert.ok(log.id);
    assert.strictEqual(log.action, 'identity_created');
    assert.strictEqual(log.result, 'success');
  } finally {
    cleanupDb(db);
  }
});

test('should get recent activity logs', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createActivityLog({
      action: 'activity_test',
      entity: 'test',
      entity_id: 'log-1',
      actor: 'system',
      result: 'success',
      details: '{}',
    });

    db.createActivityLog({
      action: 'activity_test',
      entity: 'test',
      entity_id: 'log-2',
      actor: 'system',
      result: 'success',
      details: '{}',
    });

    const recent = db.getRecentActivityLogs(10);
    assert.ok(recent.length >= 2);
  } finally {
    cleanupDb(db);
  }
});

test('should filter by action', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.createActivityLog({
      action: 'filter_action_test',
      entity: 'test',
      entity_id: 'filter-1',
      actor: 'system',
      result: 'success',
      details: '{}',
    });

    const filtered = db.getActivityLogsByAction('filter_action_test');
    assert.ok(filtered.length >= 1);
    assert.strictEqual(filtered[0].action, 'filter_action_test');
  } finally {
    cleanupDb(db);
  }
});

// ───────────── Settings ─────────────

test('should set and get setting', async () => {
  const db = freshDb();
  try {
    await db.initialize();
    db.setSetting('test_key', 'test_value');
    const value = db.getSetting('test_key');
    assert.strictEqual(value, 'test_value');
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
