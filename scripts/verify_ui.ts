/**
 * UI Verification Script — Phase 3/4
 * Verifies all 9 modules render, console is clean, no React warnings.
 */
import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const title = await page.title();
  const rootHtml = await page.evaluate(() => document.querySelector('#root')?.innerHTML?.length || 0);

  // Check all 9 modules
  const modules = ['Dashboard', 'Identity Manager', 'Inbox Manager', 'OTP / Verification', 'Browser Profiles', 'Sessions', 'Automation / QA', 'Activity Log', 'Settings'];
  const results: Record<string, boolean> = {};

  for (const mod of modules) {
    try {
      await page.click(`text=${mod}`, { timeout: 5000 });
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => document.querySelector('#root')?.textContent || '');
      results[mod] = text.length > 50;
    } catch (e) {
      results[mod] = false;
    }
  }

  console.log('Title:', title);
  console.log('Root HTML length:', rootHtml);
  console.log('Modules:', JSON.stringify(results, null, 2));
  console.log('Errors:', errors);
  console.log('Warnings:', warnings);

  await browser.close();
})();
