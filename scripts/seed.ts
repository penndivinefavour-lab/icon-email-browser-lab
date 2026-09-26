#!/usr/bin/env tsx
/**
 * Seed script for ICON Email & Browser Lab.
 * Populates database with demo data for testing.
 */

import { Database } from '../packages/database/src/index.ts';
import { v4 as uuid } from 'uuid';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'icon-lab.db');

async function main() {
  console.log('ICON Email & Browser Lab — Seed\n');
  console.log(`Database: ${dbPath}\n`);

  const db = new Database(dbPath);
  await db.initialize();

  // Check if already seeded
  const existing = db.getAllIdentities();
  if (existing.length > 0) {
    console.log(`Database already has ${existing.length} identities. Skipping seed.\n`);
    db.close();
    return;
  }

  console.log('Seeding demo data...\n');

  // ─── Identities ───
  const demoIdentities = [
    { email: 'demo-alice@example.test', displayName: 'Demo Alice', provider: 'example.test', status: 'available', tags: ['demo', 'qa'], notes: 'Seeded demo identity for testing', source: 'seeded', verificationStatus: 'unverified' },
    { email: 'demo-bob@example.test', displayName: 'Demo Bob', provider: 'example.test', status: 'assigned', tags: ['demo', 'test'], notes: 'Seeded demo identity, assigned to profile', source: 'seeded', verificationStatus: 'unverified' },
    { email: 'qa-lead@example.test', displayName: 'QA Lead', provider: 'example.test', status: 'verified', tags: ['qa', 'verified'], notes: 'Verified test identity for QA workflows', source: 'seeded', verificationStatus: 'verified' },
    { email: 'test-user-000001@example.test', displayName: 'Test User 000001', provider: 'example.test', status: 'available', tags: ['test', 'local'], notes: 'Local test identity for QA', source: 'generated', verificationStatus: 'unverified' },
    { email: 'test-user-000002@example.test', displayName: 'Test User 000002', provider: 'example.test', status: 'available', tags: ['test', 'local'], notes: 'Local test identity for QA', source: 'generated', verificationStatus: 'unverified' },
  ];

  const identityIds: string[] = [];

  for (const id of demoIdentities) {
    const result = db.createIdentity({
      email: id.email,
      display_name: id.displayName,
      provider: id.provider,
      status: id.status,
      tags: JSON.stringify(id.tags),
      notes: id.notes,
      last_used_at: null,
      browser_profile_id: null,
      verification_status: id.verificationStatus,
      source: id.source,
      metadata: JSON.stringify({ seeded: true }),
    });
    identityIds.push(result.id);
    console.log(`  ✓ Identity: ${id.email} [${id.status}]`);
  }

  // ─── Browser Profile ───
  const profileId = uuid();
  db.createBrowserProfile({
    name: 'Default QA Profile',
    browser: 'chromium',
    directory: path.join(process.cwd(), 'data', 'browser-profiles', 'default-qa'),
    identity_id: identityIds[1], // demo-bob
    status: 'active',
    last_launched_at: new Date().toISOString(),
    last_closed_at: null,
    notes: 'Default isolated browser profile for QA testing',
  });
  console.log(`  ✓ Browser Profile: Default QA Profile`);

  // ─── Email Account (for first identity) ───
  db.createEmailAccount({
    identity_id: identityIds[0],
    provider_type: 'mock',
    config: JSON.stringify({ type: 'mock', delay: 0 }),
    is_active: 1,
    last_synced_at: null,
  });

  const account = db.getEmailAccountByIdentityId(identityIds[0]);
  if (account) {
    const now = new Date();

    db.createMessage({
      account_id: account.id,
      message_id_external: 'mock-001',
      subject: 'Your verification code for ICON Lab',
      sender: 'noreply@example.test',
      recipient: demoIdentities[0].email,
      body: 'Your verification code is: 847291. This code expires in 10 minutes.',
      body_html: '<p>Your verification code is: <strong>847291</strong>. This code expires in 10 minutes.</p>',
      received_at: new Date(now.getTime() - 1000 * 60 * 2).toISOString(),
      is_read: false,
      attachments: JSON.stringify([]),
      raw_headers: null,
    });

    db.createMessage({
      account_id: account.id,
      message_id_external: 'mock-002',
      subject: 'Welcome to ICON Email Browser Lab',
      sender: 'hello@icon-studios.test',
      recipient: demoIdentities[0].email,
      body: 'Welcome! Your account has been created successfully. Start by setting up your profile.',
      body_html: null,
      received_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
      is_read: true,
      attachments: JSON.stringify([]),
      raw_headers: null,
    });

    db.createMessage({
      account_id: account.id,
      message_id_external: 'mock-003',
      subject: 'OTP: Login Verification',
      sender: 'auth@app.test',
      recipient: demoIdentities[0].email,
      body: 'Login code: 392847. Do not share this code with anyone.',
      body_html: '<p>Login code: <strong>392847</strong>. Do not share this code with anyone.</p>',
      received_at: new Date(now.getTime() - 1000 * 60 * 5).toISOString(),
      is_read: false,
      attachments: JSON.stringify([]),
      raw_headers: null,
    });

    console.log(`  ✓ Messages: 3 mock messages created`);

    // ─── Verification Codes ───
    const msgs = db.getMessagesByAccount(account.id);
    if (msgs.length >= 3) {
      db.createVerificationCode({
        message_id: msgs[0].id,
        identity_id: identityIds[0],
        sender: 'noreply@example.test',
        service_label: 'ICON Lab',
        code: '847291',
        code_type: 'otp',
        received_at: msgs[0].received_at,
        expires_at: new Date(Date.now() + 1000 * 60 * 8).toISOString(),
        status: 'detected',
        notes: null,
      });

      db.createVerificationCode({
        message_id: msgs[2].id,
        identity_id: identityIds[0],
        sender: 'auth@app.test',
        service_label: 'App Test',
        code: '392847',
        code_type: 'otp',
        received_at: msgs[2].received_at,
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
        status: 'detected',
        notes: null,
      });

      console.log(`  ✓ Verification Codes: 2 OTP codes detected`);
    }
  }

  // ─── Activity Logs ───
  const names = ['demo-alice', 'demo-bob', 'qa-lead', 'test-000001', 'test-000002'];
  const emails = demoIdentities.map((d) => d.email);

  const logEntries = [
    { action: 'identity_created', entity: 'identity', entity_id: names[0], details: { email: emails[0] } },
    { action: 'identity_created', entity: 'identity', entity_id: names[1], details: { email: emails[1] } },
    { action: 'identity_created', entity: 'identity', entity_id: names[2], details: { email: emails[2] } },
    { action: 'identity_created', entity: 'identity', entity_id: names[3], details: { email: emails[3] } },
    { action: 'identity_created', entity: 'identity', entity_id: names[4], details: { email: emails[4] } },
    { action: 'profile_created', entity: 'browser_profile', entity_id: profileId, details: { name: 'Default QA Profile' } },
    { action: 'profile_launched', entity: 'browser_profile', entity_id: profileId, details: {} },
  ];

  const msgs = account ? db.getMessagesByAccount(account.id) : [];
  msgs.forEach((msg, i) => {
    logEntries.push({
      action: 'message_received',
      entity: 'message',
      entity_id: msg.id,
      details: { subject: msg.subject },
    });
  });

  const codes = db.getVerificationCodesByIdentity(identityIds[0]);
  codes.forEach((vc) => {
    logEntries.push({
      action: 'otp_detected',
      entity: 'verification_code',
      entity_id: vc.id,
      details: { code: vc.code, service: vc.service_label || 'unknown' },
    });
  });

  for (const entry of logEntries) {
    db.createActivityLog({
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id,
      actor: 'system',
      result: 'success',
      details: JSON.stringify(entry.details),
    });
  }
  console.log(`  ✓ Activity Logs: ${logEntries.length} entries`);

  // ─── Settings ───
  db.setSetting('app_version', '1.0.0');
  db.setSetting('default_browser', 'chromium');
  console.log(`  ✓ Settings: 2 keys`);

  console.log('\n✓ Seed completed successfully.');
  console.log(`Database ready with ${db.getAllIdentities().length} identities.`);

  db.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
