/**
 * Phase 5: Browser Isolation Tests
 *
 * Proves that browser profiles are fully isolated using Playwright persistent contexts.
 * - Profile A and Profile B have separate cookies/localStorage/sessionStorage
 * - State persists within a profile after close/reopen
 * - State does NOT leak across profiles
 * - Full lifecycle: create → launch → use → close → reopen → delete
 */

import { test, expect } from '@playwright/test';
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

test.describe('Browser Profile Isolation', () => {
  const profileAId = `test-a-${randomUUID().slice(0, 8)}`;
  const profileBId = `test-b-${randomUUID().slice(0, 8)}`;
  const lifecycleId = `test-lifecycle-${randomUUID().slice(0, 8)}`;
  const multiId1 = `test-multi1-${randomUUID().slice(0, 8)}`;
  const multiId2 = `test-multi2-${randomUUID().slice(0, 8)}`;
  const multiId3 = `test-multi3-${randomUUID().slice(0, 8)}`;

  test.afterAll(() => {
    for (const id of [profileAId, profileBId, lifecycleId, multiId1, multiId2, multiId3]) {
      cleanupProfile(id);
    }
  });

  test('should isolate localStorage between two profiles', async () => {
    const pA = await launchPersistent(profileAId);
    const pB = await launchPersistent(profileBId);

    await setProfileState(pA.page, 'marker', 'alpha-value', 'cookie-alpha');
    await setProfileState(pB.page, 'marker', 'beta-value', 'cookie-beta');

    const valA = await getLocalStorage(pA.page, 'marker');
    const valB = await getLocalStorage(pB.page, 'marker');

    expect(valA).toBe('alpha-value');
    expect(valB).toBe('beta-value');
    expect(valA).not.toBe(valB);

    await pA.context.close();
    await pB.context.close();
  });

  test('should isolate cookies between profiles', async () => {
    const pA = await launchPersistent(profileAId);
    const pB = await launchPersistent(profileBId);

    await setProfileState(pA.page, 'ckey', 'ckA', 'cookieA');
    await setProfileState(pB.page, 'ckey', 'ckB', 'cookieB');

    const ckA = await getCookies(pA.page);
    const ckB = await getCookies(pB.page);

    expect(ckA).toContain('cookieA');
    expect(ckB).toContain('cookieB');
    expect(ckA).not.toContain('cookieB');
    expect(ckB).not.toContain('cookieA');

    await pA.context.close();
    await pB.context.close();
  });

  test('should not share sessionStorage between profiles', async () => {
    const pA = await launchPersistent(profileAId);
    await pA.page.goto(TEST_URL, { waitUntil: 'networkidle' });
    await pA.page.waitForTimeout(500);
    await pA.page.evaluate(() => sessionStorage.setItem('sess_key', 'sess-value-A'));
    await pA.context.close();

    const pB = await launchPersistent(profileBId);
    await pB.page.goto(TEST_URL, { waitUntil: 'networkidle' });
    await pB.page.waitForTimeout(500);
    const sessB = await pB.page.evaluate(() => sessionStorage.getItem('sess_key'));

    expect(sessB).toBeNull();
    await pB.context.close();
  });

  test('should persist state within a profile after close/reopen', async () => {
    const p = await launchPersistent(lifecycleId);
    await setProfileState(p.page, 'persist', 'persisted-value', 'persist-cookie');
    await p.context.close();

    const p2 = await launchPersistent(lifecycleId);
    const restored = await getLocalStorage(p2.page, 'persist');
    expect(restored).toBe('persisted-value');
    await p2.context.close();
  });

  test('should support full lifecycle: create, launch, use, close, reopen, delete', async () => {
    const p = await launchPersistent(lifecycleId);
    await setProfileState(p.page, 'lc', 'lc-val', 'lc-cookie');
    await p.context.close();

    const p2 = await launchPersistent(lifecycleId);
    const restored = await getLocalStorage(p2.page, 'lc');
    expect(restored).toBe('lc-val');
    await p2.context.close();

    cleanupProfile(lifecycleId);
    expect(fs.existsSync(getProfileDir(lifecycleId))).toBe(false);
  });

  test('should handle three simultaneous isolated profiles', async () => {
    const p1 = await launchPersistent(multiId1);
    const p2 = await launchPersistent(multiId2);
    const p3 = await launchPersistent(multiId3);

    await setProfileState(p1.page, 'multi', 'v1', 'c1');
    await setProfileState(p2.page, 'multi', 'v2', 'c2');
    await setProfileState(p3.page, 'multi', 'v3', 'c3');

    const v1 = await getLocalStorage(p1.page, 'multi');
    const v2 = await getLocalStorage(p2.page, 'multi');
    const v3 = await getLocalStorage(p3.page, 'multi');

    expect(v1).toBe('v1');
    expect(v2).toBe('v2');
    expect(v3).toBe('v3');
    expect(new Set([v1, v2, v3]).size).toBe(3);

    await p1.context.close();
    await p2.context.close();
    await p3.context.close();
  });
});
