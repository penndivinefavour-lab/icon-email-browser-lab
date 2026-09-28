/**
 * ICON Email & Browser Lab — Phase 4: Mock Email E2E Test
 * Tests the full flow: create identity → mock email → OTP extraction
 */

import { Database } from '../packages/database/src/index.ts';
import path from 'path';

const TEST_DB = path.join(process.cwd(), 'data', 'test-email-e2e.db');

async function main() {
  console.log('\n=== PHASE 4: MOCK EMAIL E2E VERIFICATION ===\n');
  
  // Initialize fresh database
  const db = new Database(TEST_DB);
  await db.initialize();
  console.log('✓ Database initialized');

  // Step 1: Create test identity
  console.log('\n--- Step 1: Create Identity ---');
  const identity = db.createIdentity({
    email: 'e2e-test@example.test',
    display_name: 'E2E Test User',
    provider: 'example.test',
    status: 'available',
    tags: JSON.stringify(['e2e', 'test']),
    notes: 'Created for E2E verification',
    last_used_at: null,
    browser_profile_id: null,
    verification_status: 'unverified',
    source: 'manual',
    metadata: JSON.stringify({ test_run: 'phase-4' }),
  });
  console.log(`✓ Created identity: ${identity.email} (${identity.id.slice(0, 8)}...)`);

  // Step 2: Create email account
  console.log('\n--- Step 2: Create Email Account ---');
  const account = db.createEmailAccount({
    identity_id: identity.id,
    provider_type: 'mock',
    config: JSON.stringify({ type: 'mock' }),
  });
  console.log(`✓ Created mock account: ${account.id.slice(0, 8)}...`);

  // Step 3: Simulate receiving a verification email
  console.log('\n--- Step 3: Receive Verification Email ---');
  const message = db.createMessage({
    account_id: account.id,
    message_id_external: 'e2e-msg-001',
    subject: 'Your verification code is: 847291',
    sender: 'noreply@example.test',
    recipient: identity.email,
    body: `Your verification code is 847291. It expires in 10 minutes.`,
    received_at: new Date().toISOString(),
  });
  console.log(`✓ Received message: "${message.subject}"`);

  // Step 4: Extract OTP from message
  console.log('\n--- Step 4: Extract OTP Code ---');
  // Using regex-based extraction (since we don't have otp-parser in browser yet)
  const otpMatch = message.body?.match(/\b(\d{6})\b/) || 
                   message.subject.match(/\b(\d{6})\b/);
  const otpCode = otpMatch ? otpMatch[1] : null;
  console.log(otpCode ? `✓ Extracted OTP: ${otpCode}` : '✗ Failed to extract OTP');
  if (!otpCode) {
    console.log('  Message body:', message.body);
    console.log('  Subject:', message.subject);
  }

  // Step 5: Store verification code
  console.log('\n--- Step 5: Store Verification Code ---');
  const verificationCode = db.createVerificationCode({
    message_id: message.id,
    identity_id: identity.id,
    sender: message.sender,
    service_label: 'Example Test Service',
    code: otpCode!,
  });
  console.log(`✓ Stored OTP: ${verificationCode.code} (${verificationCode.status})`);

  // Step 6: Verify code retrieval
  console.log('\n--- Step 6: Retrieve Verification Codes ---');
  const codes = db.getVerificationCodesByIdentity(identity.id);
  console.log(`✓ Found ${codes.length} code(s) for identity`);
  
  const pending = db.getPendingVerificationCodes();
  console.log(`✓ Found ${pending.length} pending code(s)`);

  // Step 7: Mark code as used
  console.log('\n--- Step 7: Mark Code as Used ---');
  const usedCode = db.markVerificationCodeUsed(verificationCode.id);
  console.log(`✓ Code status: ${usedCode?.status}`);

  // Step 8: Verify updated status
  console.log('\n--- Step 8: Verify Status Update ---');
  const fetchedCode = db.getVerificationCodeById(verificationCode.id);
  console.log(`✓ Final status: ${fetchedCode?.status}`);

  // Step 9: Get messages by identity
  console.log('\n--- Step 9: Get All Messages ---');
  const allMessages = db.getMessagesByIdentity(identity.id);
  console.log(`✓ Retrieved ${allMessages.length} message(s)`);

  // Cleanup
  db.close();
  const fs = require('fs');
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  console.log('\n✓ Database cleaned up');

  console.log('\n=== RESULTS ===');
  console.log(`Phase 4: ${otpCode === '847291' && usedCode?.status === 'used' ? 'PASS' : 'FAIL'}`);
}

main().catch(err => {
  console.error('\n✖ E2E Failed:', err.message);
  process.exit(1);
});
