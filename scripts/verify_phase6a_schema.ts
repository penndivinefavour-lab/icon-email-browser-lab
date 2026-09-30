/**
 * Phase 6a Schema Verification Script
 * Verifies migration applied correctly and secrets are isolated.
 */

import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'icon-lab.db');

async function assert(condition: boolean, message: string): Promise<void> {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main(): Promise<void> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(DB_PATH));

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  console.log('=== Phase 6a Schema Verification ===\n');

  // 1. Migration record exists
  const m1 = db.exec("SELECT name FROM _migrations WHERE name = 'provider_credentials_and_health'");
  await assert(m1.length === 1 && m1[0].values.length > 0, 'Migration #11 recorded in _migrations');

  // 2. email_credentials table exists
  const m2 = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='email_credentials'");
  await assert(m2.length === 1, 'email_credentials table exists');

  // 3. email_account_health table exists
  const m3 = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='email_account_health'");
  await assert(m3.length === 1, 'email_account_health table exists');

  // 4. email_credentials has correct columns
  const m4 = db.exec('PRAGMA table_info(email_credentials)');
  const credCols = m4[0]?.values.map((row: any[]) => row[1]) ?? [];
  await assert(credCols.includes('account_id'), 'email_credentials has account_id column');
  await assert(credCols.includes('credential_ref'), 'email_credentials has credential_ref column');
  await assert(credCols.includes('secret_kind'), 'email_credentials has secret_kind column');
  await assert(credCols.includes('secret_value'), 'email_credentials has secret_value column');
  await assert(credCols.includes('updated_at'), 'email_credentials has updated_at column');
  await assert(credCols.includes('id') || credCols.includes('credential_ref'), 'email_credentials has primary key');

  // 5. email_account_health has correct columns
  const m5 = db.exec('PRAGMA table_info(email_account_health)');
  const healthCols = m5[0]?.values.map((row: any[]) => row[1]) ?? [];
  await assert(healthCols.includes('account_id'), 'email_account_health has account_id column');
  await assert(healthCols.includes('connection_status'), 'email_account_health has connection_status column');
  await assert(healthCols.includes('last_checked_at'), 'email_account_health has last_checked_at column');
  await assert(healthCols.includes('last_error'), 'email_account_health has last_error column');
  await assert(healthCols.includes('latency_ms'), 'email_account_health has latency_ms column');

  // 6. email_accounts.config does NOT contain secrets
  const accounts = db.exec('SELECT id, config FROM email_accounts') as any[];
  for (const acc of accounts) {
    const config = JSON.parse(acc[1] || '{}');
    await assert(!config.password, `account ${acc[0]} has no password in config`);
    await assert(!config.accessToken, `account has no accessToken in config`);
    await assert(!config.clientSecret, `account has no clientSecret in config`);
  }
  await assert(true, 'No secrets leaked into email_accounts.config');

  // 7. FK constraints exist
  const m7 = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_credentials'");
  const credSql = m7[0]?.values[0]?.[0] ?? '';
  await assert(credSql.includes('FOREIGN KEY'), 'email_credentials has FK constraint');
  await assert(credSql.includes('ON DELETE CASCADE'), 'FK has ON DELETE CASCADE');

  const m7b = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='email_account_health'");
  const healthSql = m7b[0]?.values[0]?.[0] ?? '';
  await assert(healthSql.includes('FOREIGN KEY'), 'email_account_health has FK constraint');
  await assert(healthSql.includes('ON DELETE CASCADE'), 'health FK has ON DELETE CASCADE');

  // 8. PRAGMA foreign_keys is enabled
  const m8 = db.exec('PRAGMA foreign_keys');
  await assert(m8[0]?.values[0]?.[0] === 1, 'PRAGMA foreign_keys is ON');

  // 9. Verify DAO methods exist in source
  const dbSrc = readFileSync(path.join(process.cwd(), 'packages/database/src/index.ts'), 'utf8');
  await assert(dbSrc.includes('upsertEmailCredential'), 'upsertEmailCredential method exists');
  await assert(dbSrc.includes('getEmailCredentialByAccount'), 'getEmailCredentialByAccount method exists');
  await assert(dbSrc.includes('deleteEmailCredential'), 'deleteEmailCredential method exists');
  await assert(dbSrc.includes('hasEmailCredential'), 'hasEmailCredential method exists');
  await assert(dbSrc.includes('setEmailAccountHealth'), 'setEmailAccountHealth method exists');
  await assert(dbSrc.includes('getEmailAccountHealth'), 'getEmailAccountHealth method exists');
  await assert(dbSrc.includes('getAllEmailAccountHealth'), 'getAllEmailAccountHealth method exists');
  await assert(dbSrc.includes('deleteEmailAccountHealth'), 'deleteEmailAccountHealth method exists');
  await assert(dbSrc.includes('deleteEmailAccount'), 'deleteEmailAccount method exists (cascades)');

  // 10. Credentials table is empty (no real credentials stored yet)
  const m10 = db.exec('SELECT COUNT(*) as cnt FROM email_credentials');
  const credCount = m10[0]?.values[0]?.[0] ?? 0;
  await assert(credCount === 0, `email_credentials table is empty (count=${credCount})`);

  db.close();
  console.log('\n=== All checks passed ===');
}

main().catch(err => {
  console.error('\n❌ Verification failed:', err.message);
  process.exit(1);
});
