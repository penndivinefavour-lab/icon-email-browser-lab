/**
 * Browser Profile Manager
 *
 * Manages isolated browser profiles for QA/testing using Playwright.
 * Each profile uses a persistent browser context (launchPersistentContext)
 * so cookies, localStorage, and session state are fully isolated
 * and survive close/reopen cycles.
 */

import { chromium, firefox, webkit, Browser, BrowserContext, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

export interface BrowserProfileConfig {
  id: string;
  name: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  directory: string;
  identityId?: string;
  notes?: string;
}

export interface BrowserSession {
  id: string;
  profileId: string;
  context: BrowserContext;
  page: Page;
  startedAt: Date;
  isActive: boolean;
}

export interface LaunchOptions {
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
  ignoreHTTPSErrors?: boolean;
}

export class BrowserProfileManager {
  private profiles: Map<string, BrowserProfileConfig> = new Map();
  private sessions: Map<string, BrowserSession> = new Map();
  private baseDir: string;

  constructor(baseDir: string = './data/browser-profiles') {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  createProfile(config: Omit<BrowserProfileConfig, 'directory'>): BrowserProfileConfig {
    const profileDir = path.join(this.baseDir, config.id);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const profile: BrowserProfileConfig = {
      ...config,
      directory: profileDir,
    };

    this.profiles.set(config.id, profile);
    return profile;
  }

  getProfile(id: string): BrowserProfileConfig | null {
    return this.profiles.get(id) || null;
  }

  getAllProfiles(): BrowserProfileConfig[] {
    return Array.from(this.profiles.values());
  }

  updateProfile(id: string, updates: Partial<Omit<BrowserProfileConfig, 'id' | 'directory'>>): BrowserProfileConfig | null {
    const existing = this.profiles.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.profiles.set(id, updated);
    return updated;
  }

  deleteProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    // Close any active session
    this.closeSessionByProfile(id);

    // Remove directory
    try {
      fs.rmSync(profile.directory, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    this.profiles.delete(id);
    return true;
  }

  /**
   * Launch a profile with persistent browser context.
   * Uses launchPersistentContext so cookies/localStorage persist across sessions.
   */
  async launchProfile(
    id: string,
    options: LaunchOptions = {}
  ): Promise<BrowserSession | null> {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }

    // Check if already launched
    const existing = this.sessions.get(id);
    if (existing && existing.isActive) {
      return existing;
    }

    const browserType = this.getBrowserType(profile.browser);
    const launchOptions: any = {
      headless: options.headless ?? true,
      viewport: options.viewport || { width: 1280, height: 720 },
    };

    if (options.slowMo) {
      launchOptions.slowMo = options.slowMo;
    }

    // Use launchPersistentContext for true isolation
    // This creates a real browser profile directory that persists state
    const context = await browserType.launchPersistentContext(profile.directory, launchOptions);

    const page = context.pages()[0] || await context.newPage();

    const session: BrowserSession = {
      id: randomUUID(),
      profileId: id,
      context,
      page,
      startedAt: new Date(),
      isActive: true,
    };

    this.sessions.set(id, session);
    return session;
  }

  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    session.isActive = false;
    await session.context.close();
    this.sessions.delete(id);
  }

  async closeSessionByProfile(profileId: string): Promise<void> {
    const session = this.sessions.get(profileId);
    if (session) {
      await this.closeSession(profileId);
    }
  }

  getSession(id: string): BrowserSession | null {
    return this.sessions.get(id) || null;
  }

  getActiveSessions(): BrowserSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  async takeScreenshot(sessionId: string, filePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    await session.page.screenshot({ path: filePath, fullPage: true });
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    await session.page.goto(url, { waitUntil: 'networkidle' });
  }

  async closeAllSessions(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      session.isActive = false;
      try {
        await session.context.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.sessions.clear();
  }

  private getBrowserType(type: 'chromium' | 'firefox' | 'webkit') {
    switch (type) {
      case 'chromium':
        return chromium;
      case 'firefox':
        return firefox;
      case 'webkit':
        return webkit;
      default:
        return chromium;
    }
  }
}

// Singleton
let managerInstance: BrowserProfileManager | null = null;

export function getBrowserProfileManager(baseDir?: string): BrowserProfileManager {
  if (!managerInstance) {
    managerInstance = new BrowserProfileManager(baseDir);
  }
  return managerInstance;
}
