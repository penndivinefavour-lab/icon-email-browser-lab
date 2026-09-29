/**
 * Phase 5: Browser Isolation Tests
 *
 * Proves that browser profiles are fully isolated using Playwright persistent contexts.
 * - Profile A and Profile B have separate cookies/localStorage/sessionStorage
 * - State persists within a profile after close/reopen
 * - State does NOT leak across profiles
 * - Full lifecycle: create → launch → use → close → reopen → delete
 */

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const TEST_URL = 'http://localhost:3000/test/isolation.html';
const PROFILES_DIR = path.join(process.cwd(), 'data', 'browser-profiles');

// ─── Helpers ────────────────────────────────────────────────────────

function getProfileDir(profileId: string): string {
  return path.join(PROFILES_DIR, profileId);
}

function cleanupProfile(profileId: string): void {
  const dir = getProfileDir(profileId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function launchPersistent(profileId: string) {
  const profileDir = getProfileDir(profileId);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

async function setProfileState(
  page: any,
  key: string,
  value: string,
  cookieValue: string
): Promise<void> {
  await page.goto(TEST_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('#lsKey', key);
  await page.fill('#lsValue', value);
  await page.fill('#cookieValue', cookieValue);
  await page.click('#setStateBtn');
  await page.waitForSelector('#setStatus.success', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function getLocalStorage(page: any, key: string): Promise<string | null> {
  await page.goto(TEST_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  return page.evaluate((k: string) => localStorage.getItem(k), key);
}

async function getCookies(page: any): Promise<string> {
  await page.goto(TEST_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  return page.evaluate(() => document.cookie);
}

// ─── Tests ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 5: Browser Isolation Tests (Playwright) ===\n');

  // Ensure directory exists
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }

  // Create test profile IDs
  const profileAId = `phase5-a-${randomUUID().slice(0, 8)}`;
  const profileBId = `phase5-b-${randomUUID().slice(0, 8)}`;
  const lifecycleId = `phase5-lifecycle-${randomUUID().slice(0, 8)}`;
  const multiId1 = `phase5-multi1-${randomUUID().slice(0, 8)}`;
  const multiId2 = `phase5-multi2-${randomUUID().slice(0, 8)}`;
  const multiId3 = `phase5-multi3-${randomUUID().slice(0, 8)}`;

  let passed = 0;
  let failed = 0;
  const results: { name: string; pass: boolean; error?: string }[] = [];

  try {
    // ── Test 1: Basic localStorage isolation ──
    try {
      console.log('Test 1: Basic localStorage isolation between profiles');
      const pA = await launchPersistent(profileAId);
      const pB = await launchPersistent(profileBId);

      await setProfileState(pA.page, 'marker', 'value-A', 'cookie-A');
      await setProfileState(pB.page, 'marker', 'value-B', 'cookie-B');

      const valA = await getLocalStorage(pA.page, 'marker');
      const valB = await getLocalStorage(pB.page, 'marker');

      if (valA !== 'value-A') throw new Error(`Profile A saw wrong value: ${valA}`);
      if (valB !== 'value-B') throw new Error(`Profile B saw wrong value: ${valB}`);
      if (valA === valB) throw new Error(`Values should differ but both are: ${valA}`);

      await pA.context.close();
      await pB.context.close();

      passed++;
      results.push({ name: 'Basic localStorage isolation', pass: true });
      console.log('  ✓ PASS\n');
    } catch (err: any) {
      failed++;
      results.push({ name: 'Basic localStorage isolation', pass: false, error: err.message });
      console.log(`  ✗ FAIL: ${err.message}\n`);
    }

    // ── Test 2: Cookie isolation ──
    try {
      console.log('Test 2: Cookie isolation between profiles');
      const pA = await launchPersistent(profileAId);
      const pB = await launchPersistent(profileBId);

      await setProfileState(pA.page, 'ckey', 'ckA', 'cookieA');
      await setProfileState(pB.page, 'ckey', 'ckB', 'cookieB');

      const ckA = await getCookies(pA.page);
      const ckB = await getCookies(pB.page);

      if (!ckA.includes('cookieA')) throw new Error(`Profile A missing cookieA: ${ckA}`);
      if (!ckB.includes('cookieB')) throw new Error(`Profile B missing cookieB: ${ckB}`);
      if (ckA.includes('cookieB')) throw new Error(`Profile A leaked cookieB`);
      if (ckB.includes('cookieA')) throw new Error(`Profile B leaked cookieA`);

      await pA.context.close();
      await pB.context.close();

      passed++;
      results.push({ name: 'Cookie isolation', pass: true });
      console.log('  ✓ PASS\n');
    } catch (err: any) {
      failed++;
      results.push({ name: 'Cookie isolation', pass: false, error: err.message });
      console.log(`  ✗ FAIL: ${err.message}\n`);
    }

    // ── Test 3: Session storage isolation ──
    try {
      console.log('Test 3: Session storage isolation between profiles');
      const pA = await launchPersistent(profileAId);
      const pB = await launchPersistent(profileBId);

      await pA.page.goto(TEST_URL, { waitUntil: 'networkidle' });
      await pA.page.waitForTimeout(500);
      await pA.page.evaluate(() => sessionStorage.setItem('sess_key', 'sess-value-A'));
      await pA.context.close();

      const pB2 = await launchPersistent(profileBId);
      await pB2.page.goto(TEST_URL, { waitUntil: 'networkidle' });
      await pB2.page.waitForTimeout(500);
      const sessB = await pB2.page.evaluate(() => sessionStorage.getItem('sess_key'));

      if (sessB !== null) throw new Error(`Profile B leaked session storage: ${sessB}`);

      await pB2.context.close();

      passed++;
      results.push({ name: 'Session storage isolation', pass: true });
      console.log('  ✓ PASS\n');
    } catch (err: any) {
      failed++;
      results.push({ name: 'Session storage isolation', pass: false, error: err.message });
      console.log(`  ✗ FAIL: ${err.message}\n`);
    }

    // ── Test 4: Persistence across close/reopen ──
    try {
      console.log('Test 4: State persists within profile after close/reopen');
      const p = await launchPersistent(lifecycleId);
      await setProfileState(p.page, 'persist', 'persisted-value', 'persist-cookie');
      await p.context.close();

      const p2 = await launchPersistent(lifecycleId);
      const restored = await getLocalStorage(p2.page, 'persist');

      if (restored !== 'persisted-value') throw new Error(`Persistence failed: ${restored}`);

      await p2.context.close();

      passed++;
      results.push({ name: 'Persistence after close/reopen', pass: true });
      console.log('  ✓ PASS\n');
    } catch (err: any) {
      failed++;
      results.push({ name: 'Persistence after close/reopen', pass: false, error: err.message });
      console.log(`  ✗ FAIL: ${err.message}\n`);
    }

    // ── Test 5: Full lifecycle ──
    try {
      console.log('Test 5: Full lifecycle (create, launch, use, close, reopen, delete)');
      const p = await launchPersistent(lifecycleId);
      await setProfileState(p.page, 'lc', 'lc-val', 'lc-cookie');
      await p.context.close();

      const p2 = await launchPersistent(lifecycleId);
      const restored = await getLocalStorage(p2.page, 'lc');

      if (restored !== 'lc-val') throw new Error(`Lifecycle failed: ${restored}`);

      await p2.context.close();
      cleanupProfile(lifecycleId);

      if (fs.existsSync(getProfileDir(lifecycleId))) {
        throw new Error('Profile not deleted');
      }

      passed++;
      results.push({ name: 'Full lifecycle', pass: true });
      console.log('  ✓ PASS\n');
    } catch (err: any) {
      failed++;
      results.push({ name: 'Full lifecycle', pass: false, error: err.message });
      console.log(`  ✗ FAIL: ${err.message}\n`);
    }

    // ── Test 6: Multiple simultaneous profiles ──
    try {
      console.log('Test 6: Multiple simultaneous isolated profiles');
      const p1 = await launchPersistent(multiId1);
      const p2 = await launchPersistent(multiId2);
      const p3 = await launchPersistent(multiId3);

      await setProfileState(p1.page, 'multi', 'v1', 'c1');
      await setProfileState(p2.page, 'multi', 'v2', 'c2');
      await setProfileState(p3.page, 'multi', 'v3', 'c3');

      const v1 = await getLocalStorage(p1.page, 'multi');
      const v2 = await getLocalStorage(p2.page, 'multi');
      const v3 = await getLocalStorage(p3.page, 'multi');

      if (v1 !== 'v1') throw new Error(`P1 wrong: ${v1}`);
      if (v2 !== 'v2') throw new Error(`P2 wrong: ${v2}`);
      if (v3 !== 'v3') throw new Error(`P3 wrong: ${v3}`);

      await p1.context.close();
      await p2.context.close();
      await p3.context.close();

      passed++;
      results.push({ name: 'Multiple simultaneous profiles', pass: true });
      console.log('  ✓ PASS\n');
    } catch (err: any) {
      failed++;
      results.push({ name: 'Multiple simultaneous profiles', pass: false, error: err.message });
      console.log(`  ✗ FAIL: ${err.message}\n`);
    }

    // ── Summary ──
    console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
    if (failed > 0) {
      console.log('\nFailed tests:');
      for (const r of results) {
        if (!r.pass) {
          console.log(`  - ${r.name}: ${r.error}`);
        }
      }
    }

    process.exit(failed > 0 ? 1 : 0);
  } finally {
    // Cleanup all test profiles
    for (const id of [profileAId, profileBId, lifecycleId, multiId1, multiId2, multiId3]) {
      cleanupProfile(id);
    }
  }
}

main().catch((err) => {
  console.error('FATAL ERROR:', err.message);
  process.exit(1);
});
