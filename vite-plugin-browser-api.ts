/**
 * Vite Plugin: Browser Profile API
 *
 * Provides REST API endpoints for the UI to interact with Playwright.
 * Mounted directly on the underlying Node HTTP server so it runs BEFORE Vite's
 * internal handlers, which otherwise swallow any request that doesn't match a
 * known Vite virtual module URL.
 */

import type { Plugin } from 'vite';
import { getBrowserProfileManager } from './packages/browser/src/index';
import { getDatabase, ensureDbInitialized } from './packages/database/src/index';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const PLUGIN_ROOT = path.resolve(__dirname);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  for (const [k, v] of Object.entries(JSON_HEADERS)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function browserProfileApi(): Plugin {
  return {
    name: 'browser-profile-api',
    configureServer(server) {
      const manager = getBrowserProfileManager(
        path.join(process.cwd(), 'data', 'browser-profiles')
      );
      const db = getDatabase();
      if (!db.initialized) db.initialize().catch(console.error);

      // Mount on the raw HTTP server so it fires before Vite's handler.
      const onRequest = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const pathname = url.pathname;

        // ── /api/profiles ──────────────────────────────────────────────
        if (pathname === '/api/profiles') {
          if (req.method === 'GET') {
            return send(res, 200, db.getAllBrowserProfiles());
          }
          if (req.method === 'POST') {
            readBody(req).then((body) => {
              try {
                const { name, browser } = JSON.parse(body);
                const id = randomUUID().slice(0, 8);
                const profile = manager.createProfile({ id, name: name || `Profile ${id}`, browser: browser || 'chromium' });
                db.createBrowserProfile({ name: profile.name, browser: profile.browser });
                return send(res, 201, profile);
              } catch (err: any) {
                return send(res, 400, { error: err.message });
              }
            });
            return;
          }
          return send(res, 405, { error: 'Method not allowed' });
        }

        // ── /api/profiles/:id/launch ───────────────────────────────────
        const launchMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/launch$/);
        if (launchMatch && req.method === 'POST') {
          const profileId = launchMatch[1];
          manager.launchProfile(profileId)
            .then((session) => {
              const sessionRecord = db.createSession({ profile_id: profileId, status: 'active' });
              return send(res, 200, { session, dbSession: sessionRecord });
            })
            .catch((err: any) => send(res, 500, { error: err.message }));
          return;
        }

        // ── /api/profiles/:id/close ────────────────────────────────────
        const closeMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/close$/);
        if (closeMatch && req.method === 'POST') {
          const profileId = closeMatch[1];
          manager.closeSession(profileId)
            .then(() => {
              const activeSession = db.getActiveSessions().find((s) => s.profile_id === profileId);
              if (activeSession) db.endSession(activeSession.id);
              return send(res, 200, { success: true });
            })
            .catch((err: any) => send(res, 500, { error: err.message }));
          return;
        }

        // ── /api/profiles/:id ──────────────────────────────────────────
        const deleteMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
        if (deleteMatch && req.method === 'DELETE') {
          const profileId = deleteMatch[1];
          const success = manager.deleteProfile(profileId);
          if (success) db.deleteBrowserProfile(profileId);
          return send(res, 200, { success });
        }

        // ── /api/sessions ──────────────────────────────────────────────
        if (pathname === '/api/sessions' && req.method === 'GET') {
          return send(res, 200, db.getAllSessions());
        }

        // ── /api/test-runs ─────────────────────────────────────────────
        if (pathname === '/api/test-runs') {
          if (req.method === 'GET') return send(res, 200, db.getAllTestRuns());
          const runMatch = pathname.match(/^\/api\/test-runs\/([^/]+)\/run$/);
          if (runMatch && req.method === 'POST') {
            const run = db.getTestRunById(runMatch[1]);
            return send(res, 200, run ?? { error: 'Not found' });
          }
          return send(res, 405, { error: 'Method not allowed' });
        }

        // Not our route — let Vite handle it
      };

      server.httpServer?.on('request', onRequest);
    },
  };
}
