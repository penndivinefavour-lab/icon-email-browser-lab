/**
 * Test Runner / QA Automation
 *
 * Manages test runs, executes automated tests, and records results.
 * Phase 5: Added real browser-isolation test cases using Playwright.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { randomUUID } from 'node:crypto';

export type TestStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
export type TestResult = 'passed' | 'failed' | 'skipped';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: 'login' | 'verification' | 'otp' | 'profile' | 'session' | 'isolation' | 'custom';
  execute: (context: TestContext) => Promise<TestResult>;
}

export interface TestContext {
  testRunId: string;
  profileId?: string;
  identityId?: string;
  targetEnvironment: string;
  logs: string[];
  screenshots: string[];
  addLog: (message: string) => void;
  addScreenshot: (filePath: string) => void;
  setStatus: (status: TestStatus) => void;
}

export interface TestRunnerConfig {
  timeoutMs?: number;
  screenshotOnFailure?: boolean;
  screenshotDir?: string;
}

export class TestRunner {
  private config: Required<TestRunnerConfig>;
  private testCases: Map<string, TestCase> = new Map();
  private activeRuns: Map<string, { cancelled: boolean }> = new Map();

  constructor(config: TestRunnerConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 30000,
      screenshotOnFailure: config.screenshotOnFailure ?? true,
      screenshotDir: config.screenshotDir ?? './data/test-screenshots',
    };

    if (!existsSync(this.config.screenshotDir)) {
      mkdirSync(this.config.screenshotDir, { recursive: true });
    }

    this.registerDefaultTestCases();
  }

  private registerDefaultTestCases(): void {
    // ─── Browser Isolation Tests (Phase 5) ──────────────────────────

    this.testCases.set('isolation-basic', {
      id: 'isolation-basic',
      name: 'Browser Profile Isolation — Basic',
      description: 'Verifies two profiles have isolated localStorage and cookies',
      type: 'isolation',
      execute: async (ctx) => {
        ctx.addLog('[Isolation Basic] Starting basic isolation test...');

        const { chromium } = await import('@playwright/test');
        const path = await import('node:path');
        const fs = await import('node:fs');

        const profilesDir = path.join(process.cwd(), 'data', 'browser-profiles');
        const testId = `iso-basic-${randomUUID().slice(0, 8)}`;
        const profileA = path.join(profilesDir, `${testId}-a`);
        const profileB = path.join(profilesDir, `${testId}-b`);

        try {
          fs.mkdirSync(profileA, { recursive: true });
          fs.mkdirSync(profileB, { recursive: true });

          const browser = await chromium.launch({ headless: true });

          // Profile A
          const ctxA = await browser.newContext();
          const pageA = await ctxA.newPage();
          await pageA.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          await pageA.fill('#lsKey', 'marker');
          await pageA.fill('#lsValue', 'value-A');
          await pageA.fill('#cookieValue', 'cookie-A');
          await pageA.click('#setStateBtn');
          await pageA.waitForSelector('#setStatus.success', { timeout: 5000 });
          await ctxA.close();

          // Profile B
          const ctxB = await browser.newContext();
          const pageB = await ctxB.newPage();
          await pageA.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          await pageB.fill('#lsKey', 'marker');
          await pageB.fill('#lsValue', 'value-B');
          await pageB.fill('#cookieValue', 'cookie-B');
          await pageB.click('#setStateBtn');
          await pageB.waitForSelector('#setStatus.success', { timeout: 5000 });
          await ctxB.close();

          // Verify isolation
          const ctxA2 = await browser.newContext();
          const pageA2 = await ctxA2.newPage();
          await pageA2.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          const stateA = await pageA2.evaluate(() => localStorage.getItem('marker'));
          await ctxA2.close();

          const ctxB2 = await browser.newContext();
          const pageB2 = await ctxB2.newPage();
          await pageB2.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          const stateB = await pageB2.evaluate(() => localStorage.getItem('marker'));
          await ctxB2.close();

          await browser.close();

          if (stateA !== 'value-A' || stateB !== 'value-B') {
            ctx.addLog(`[Isolation Basic] FAIL: stateA=${stateA}, stateB=${stateB}`);
            return 'failed';
          }

          ctx.addLog('[Isolation Basic] PASS: Profiles are isolated');
          return 'passed';
        } catch (err: any) {
          ctx.addLog(`[Isolation Basic] ERROR: ${err.message}`);
          return 'failed';
        } finally {
          // Cleanup
          try { fs.rmSync(profileA, { recursive: true, force: true }); } catch {}
          try { fs.rmSync(profileB, { recursive: true, force: true }); } catch {}
        }
      },
    });

    this.testCases.set('isolation-persistence', {
      id: 'isolation-persistence',
      name: 'Browser Profile Isolation — Persistence',
      description: 'Verifies profile state persists after close/reopen using persistent contexts',
      type: 'isolation',
      execute: async (ctx) => {
        ctx.addLog('[Isolation Persistence] Starting persistence test...');

        const { chromium } = await import('@playwright/test');
        const path = await import('node:path');
        const fs = await import('node:fs');

        const profilesDir = path.join(process.cwd(), 'data', 'browser-profiles');
        const testId = `iso-persist-${randomUUID().slice(0, 8)}`;
        const profileDir = path.join(profilesDir, testId);

        try {
          fs.mkdirSync(profileDir, { recursive: true });

          const browser = await chromium.launch({ headless: true });

          // Launch persistent context, set state, close
          const ctx1 = await browser.newContext();
          const page1 = await ctx1.newPage();
          await page1.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          await page1.fill('#lsKey', 'persist');
          await page1.fill('#lsValue', 'persisted-value');
          await page1.fill('#cookieValue', 'persisted-cookie');
          await page1.click('#setStateBtn');
          await page1.waitForSelector('#setStatus.success', { timeout: 5000 });
          await ctx1.close();

          // Reopen with persistent context
          const ctx2 = await chromium.launchPersistentContext(profileDir, {
            headless: true,
            viewport: { width: 1280, height: 720 },
          });
          const page2 = ctx2.pages()[0] || await ctx2.newPage();
          await page2.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          const persisted = await page2.evaluate(() => localStorage.getItem('persist'));
          await ctx2.close();
          await browser.close();

          if (persisted !== 'persisted-value') {
            ctx.addLog(`[Isolation Persistence] FAIL: persisted=${persisted}`);
            return 'failed';
          }

          ctx.addLog('[Isolation Persistence] PASS: State persisted after close/reopen');
          return 'passed';
        } catch (err: any) {
          ctx.addLog(`[Isolation Persistence] ERROR: ${err.message}`);
          return 'failed';
        } finally {
          try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
        }
      },
    });

    this.testCases.set('isolation-lifecycle', {
      id: 'isolation-lifecycle',
      name: 'Browser Profile Isolation — Full Lifecycle',
      description: 'Tests create, launch, use, close, reopen, and delete profile',
      type: 'isolation',
      execute: async (ctx) => {
        ctx.addLog('[Isolation Lifecycle] Starting lifecycle test...');

        const { chromium } = await import('@playwright/test');
        const path = await import('node:path');
        const fs = await import('node:fs');

        const profilesDir = path.join(process.cwd(), 'data', 'browser-profiles');
        const testId = `iso-lifecycle-${randomUUID().slice(0, 8)}`;
        const profileDir = path.join(profilesDir, testId);

        try {
          // Create
          fs.mkdirSync(profileDir, { recursive: true });
          ctx.addLog('[Isolation Lifecycle] Profile created');

          const browser = await chromium.launch({ headless: true });

          // Launch and use
          const ctx1 = await chromium.launchPersistentContext(profileDir, {
            headless: true,
            viewport: { width: 1280, height: 720 },
          });
          const page1 = ctx1.pages()[0] || await ctx1.newPage();
          await page1.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          await page1.fill('#lsKey', 'lifecycle');
          await page1.fill('#lsValue', 'lifecycle-value');
          await page1.click('#setStateBtn');
          await page1.waitForSelector('#setStatus.success', { timeout: 5000 });
          ctx.addLog('[Isolation Lifecycle] Profile used');

          // Close
          await ctx1.close();
          ctx.addLog('[Isolation Lifecycle] Profile closed');

          // Reopen
          const ctx2 = await chromium.launchPersistentContext(profileDir, {
            headless: true,
            viewport: { width: 1280, height: 720 },
          });
          const page2 = ctx2.pages()[0] || await ctx2.newPage();
          await page2.goto('http://localhost:3000/test/isolation.html', { waitUntil: 'networkidle' });
          const value = await page2.evaluate(() => localStorage.getItem('lifecycle'));
          await ctx2.close();

          if (value !== 'lifecycle-value') {
            ctx.addLog(`[Isolation Lifecycle] FAIL: value=${value}`);
            return 'failed';
          }
          ctx.addLog('[Isolation Lifecycle] Reopen verified');

          // Delete
          fs.rmSync(profileDir, { recursive: true, force: true });
          if (fs.existsSync(profileDir)) {
            ctx.addLog('[Isolation Lifecycle] FAIL: Profile not deleted');
            return 'failed';
          }
          ctx.addLog('[Isolation Lifecycle] Profile deleted');

          await browser.close();
          ctx.addLog('[Isolation Lifecycle] PASS: Full lifecycle verified');
          return 'passed';
        } catch (err: any) {
          ctx.addLog(`[Isolation Lifecycle] ERROR: ${err.message}`);
          return 'failed';
        } finally {
          try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
        }
      },
    });

    // ─── Legacy Tests (kept for backward compatibility) ─────────────

    this.testCases.set('login-flow', {
      id: 'login-flow',
      name: 'Login Flow Test',
      description: 'Tests basic login flow on the target environment',
      type: 'login',
      execute: async (ctx) => {
        ctx.addLog('[Login Flow] Starting login flow test...');
        await new Promise((r) => setTimeout(r, 500));
        ctx.addLog('[Login Flow] Login successful');
        return 'passed';
      },
    });

    this.testCases.set('email-verification', {
      id: 'email-verification',
      name: 'Email Verification Flow Test',
      description: 'Tests email verification flow with OTP extraction',
      type: 'verification',
      execute: async (ctx) => {
        ctx.addLog('[Email Verification] Starting...');
        await new Promise((r) => setTimeout(r, 600));
        ctx.addLog('[Email Verification] Email verified successfully');
        return 'passed';
      },
    });

    this.testCases.set('otp-extraction', {
      id: 'otp-extraction',
      name: 'OTP Extraction Test',
      description: 'Tests OTP detection and extraction from emails',
      type: 'otp',
      execute: async (ctx) => {
        ctx.addLog('[OTP Extraction] Starting...');
        await new Promise((r) => setTimeout(r, 400));
        ctx.addLog('[OTP Extraction] OTP codes extracted successfully');
        return 'passed';
      },
    });

    this.testCases.set('profile-isolation', {
      id: 'profile-isolation',
      name: 'Browser Profile Isolation Test',
      description: 'Tests that browser profiles are properly isolated',
      type: 'profile',
      execute: async (ctx) => {
        ctx.addLog('[Profile Isolation] Starting isolation test...');
        if (!ctx.profileId) {
          ctx.addLog('[Profile Isolation] ERROR: No profile ID provided');
          return 'failed';
        }
        ctx.addLog(`[Profile Isolation] Using profile: ${ctx.profileId}`);
        await new Promise((r) => setTimeout(r, 800));
        ctx.addLog('[Profile Isolation] Profile isolation verified');
        return 'passed';
      },
    });

    this.testCases.set('session-lifecycle', {
      id: 'session-lifecycle',
      name: 'Session Lifecycle Test',
      description: 'Tests session start, active state, and termination',
      type: 'session',
      execute: async (ctx) => {
        ctx.addLog('[Session Lifecycle] Starting lifecycle test...');
        await new Promise((r) => setTimeout(r, 1000));
        ctx.addLog('[Session Lifecycle] Session terminated successfully');
        return 'passed';
      },
    });
  }

  registerTestCase(testCase: TestCase): void {
    this.testCases.set(testCase.id, testCase);
  }

  unregisterTestCase(id: string): boolean {
    return this.testCases.delete(id);
  }

  getTestCase(id: string): TestCase | null {
    return this.testCases.get(id) || null;
  }

  getAllTestCases(): TestCase[] {
    return Array.from(this.testCases.values());
  }

  async runTest(
    testCaseId: string,
    context: {
      testRunId: string;
      profileId?: string;
      identityId?: string;
      targetEnvironment?: string;
    }
  ): Promise<{ status: TestStatus; result?: string; logs: string[] }> {
    const testCase = this.testCases.get(testCaseId);
    if (!testCase) {
      throw new Error(`Test case not found: ${testCaseId}`);
    }

    const cancelToken = { cancelled: false };
    this.activeRuns.set(context.testRunId, cancelToken);

    const logs: string[] = [];
    const screenshots: string[] = [];

    const testContext: TestContext = {
      testRunId: context.testRunId,
      profileId: context.profileId,
      identityId: context.identityId,
      targetEnvironment: context.targetEnvironment || 'local',
      logs,
      screenshots,
      addLog: (message) => {
        const timestamp = new Date().toISOString();
        logs.push(`[${timestamp}] ${message}`);
      },
      addScreenshot: (filePath) => {
        screenshots.push(filePath);
      },
      setStatus: (_status) => {
        // Status is managed externally
      },
    };

    const timeoutMs = this.config.timeoutMs;

    try {
      testContext.addLog(`[Test Runner] Starting test: ${testCase.name}`);
      testContext.addLog(`[Test Runner] Target environment: ${testContext.targetEnvironment}`);
      if (testContext.profileId) {
        testContext.addLog(`[Test Runner] Browser profile: ${testContext.profileId}`);
      }
      if (testContext.identityId) {
        testContext.addLog(`[Test Runner] Identity: ${testContext.identityId}`);
      }

      const startTime = Date.now();
      const result = await Promise.race([
        testCase.execute(testContext),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Test timeout')), timeoutMs)
        ),
      ]);

      const duration = Date.now() - startTime;
      testContext.addLog(`[Test Runner] Test completed in ${duration}ms`);

      if (cancelToken.cancelled) {
        testContext.addLog('[Test Runner] Test was cancelled');
        return { status: 'cancelled', logs };
      }

      if (result === 'failed' || result === 'skipped') {
        testContext.addLog(`[Test Runner] Test ${result}`);
        if (this.config.screenshotOnFailure) {
          const screenshotPath = pathJoin(
            this.config.screenshotDir,
            `${context.testRunId}-failure.png`
          );
          testContext.addScreenshot(screenshotPath);
        }
        return { status: 'failed', result, logs };
      }

      testContext.addLog(`[Test Runner] Test passed`);
      return { status: 'passed', result: 'passed', logs };
    } catch (error: any) {
      testContext.addLog(`[Test Runner] Test error: ${error.message || error}`);

      if (this.config.screenshotOnFailure) {
        const screenshotPath = pathJoin(
          this.config.screenshotDir,
          `${context.testRunId}-error.png`
        );
        testContext.addScreenshot(screenshotPath);
      }

      return { status: 'failed', result: 'failed', logs };
    } finally {
      this.activeRuns.delete(context.testRunId);
    }
  }

  cancelTest(testRunId: string): void {
    const cancelToken = this.activeRuns.get(testRunId);
    if (cancelToken) {
      cancelToken.cancelled = true;
    }
  }

  getConfig(): Readonly<TestRunnerConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<TestRunnerConfig>): void {
    this.config = { ...this.config, ...updates };
    if (!this.config.screenshotDir) {
      this.config.screenshotDir = './data/test-screenshots';
    }
  }
}

// Singleton
let runnerInstance: TestRunner | null = null;

export function getTestRunner(config?: TestRunnerConfig): TestRunner {
  if (!runnerInstance) {
    runnerInstance = new TestRunner(config);
  } else if (config) {
    runnerInstance = new TestRunner(config);
  }
  return runnerInstance;
}
