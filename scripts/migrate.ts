#!/usr/bin/env tsx
/**
 * Migration runner for ICON Email & Browser Lab.
 * Uses the sql.js-based database package.
 */

import { Database } from '../packages/database/src/index';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'icon-lab.db');

async function main() {
  console.log('ICON Email & Browser Lab — Migrations\n');
  console.log(`Database: ${dbPath}\n`);

  const db = new Database(dbPath);
  await db.initialize();

  console.log('All migrations applied successfully.');
  console.log(`Database ready: ${dbPath}\n`);

  const count = db.getAllIdentities().length;
  const profiles = db.getAllBrowserProfiles().length;
  console.log(`Current state: ${count} identities, ${profiles} profiles`);

  db.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
