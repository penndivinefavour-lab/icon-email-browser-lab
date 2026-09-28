/**
 * ICON Email & Browser Lab — Phase 3: UI Verification (v4)
 */

import { chromium } from 'playwright';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
  console.log('\n=== PHASE 3: UI VERIFICATION ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Collect all console messages
  const messages: Array<{type: string, text: string}> = [];
  page.on('console', msg => {
    messages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') console.log(`[ERROR] ${msg.text()}`);
    if (msg.type() === 'warning') console.log(`[WARN] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    messages.push({ type: 'error', text: err.message });
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  // Navigate to app
  console.log(`Navigating to ${BASE_URL}...`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  // Get page info
  const title = await page.title();
  console.log(`Title: "${title}"`);

  const html = await page.content();
  console.log(`HTML length: ${html.length}`);
  
  const bodyText = await page.locator('body').innerText();
  console.log(`Body text length: ${bodyText.length}`);
  
  const rootEl = await page.locator('#root').count();
  console.log(`#root element: ${rootEl > 0 ? 'EXISTS' : 'MISSING'}`);

  // Count interactive elements
  const buttons = await page.locator('button').count();
  const inputs = await page.locator('input').count();
  const selects = await page.locator('select').count();
  console.log(`Buttons: ${buttons}, Inputs: ${inputs}, Selects: ${selects}`);

  // Check for specific UI content
  const hasDashboard = bodyText.includes('Dashboard') || html.includes('Dashboard');
  const hasIdentity = bodyText.includes('Identity') || html.includes('identity');
  const hasSettings = bodyText.includes('Settings') || html.includes('settings');
  console.log(`\nDashboard content: ${hasDashboard ? '✓' : '✗'}`);
  console.log(`Identity content: ${hasIdentity ? '✓' : '✗'}`);
  console.log(`Settings content: ${hasSettings ? '✓' : '✗'}`);

  // Try to interact with the UI - click on Identity Manager
  try {
    const identityNav = page.locator('text=Identity Manager').first();
    if (await identityNav.count() > 0) {
      await identityNav.click();
      await page.waitForTimeout(1000);
      const afterClick = await page.locator('body').innerText();
      console.log(`\nAfter clicking Identity Manager: ${afterClick.length > 0 ? 'Content loaded ✓' : 'No change ✗'}`);
    }
  } catch (e: any) {
    console.log(`Navigation click failed: ${e.message.split('\n')[0]}`);
  }

  await browser.close();
  
  const errors = messages.filter(m => m.type === 'error');
  console.log('\n=== RESULTS ===');
  console.log(`Console Errors: ${errors.length}`);
  console.log(`Errors: ${errors.map(e => e.text).slice(0, 3).join(', ')}`);
  console.log(`Phase 3: ${errors.length === 0 && rootEl > 0 ? 'PASS' : 'FAIL'}`);
}

main().catch(err => {
  console.error('E2E Failed:', err.message);
  process.exit(1);
});
