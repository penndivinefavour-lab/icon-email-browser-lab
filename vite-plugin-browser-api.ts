/**
 * Vite Plugin: Browser Profile API
 *
 * Provides REST API endpoints for the UI to interact with Playwright.
 * This is a local-only middleware for the Vite dev server.
 */

import type { Plugin } from 'vite';
import { getBrowserProfileManager } from '../../packages/browser/src/index';
import { getDatabase } from '../../packages/database/src/index';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

export function browserProfileApi(): Plugin {
  return {
    name: 'browser-profile-api',
    configureServer(server) {
      const manager = getBrowserProfileManager(
        path.join(process.cwd(), 'data', 'browser-profiles')
      );

      // GET /api/profiles — list all profiles
      server.middlewares.use('/api/profiles', (req, res) => {
        if (req.method === 'GET') {
          const db = getDatabase();
          const profiles = db.getAllBrowserProfiles();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(profiles));
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              const { name, browser } = JSON.parse(body);
              const id = randomUUID().slice(0, 8);
              const profile = manager.createProfile({
                id,
                name: name || `Profile ${id}`,
                browser: browser || 'chromium',
              });

              // Also create in database
              const db = getDatabase();
              db.createBrowserProfile({ name: profile.name, browser: profile.browser });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(profile));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        }
      });

      // POST /api/profiles/:id/launch — launch a profile
      server.middlewares.use('/api/profiles', (req, res) => {
        const match = req.url?.match(/^\/([^/]+)\/launch$/);
        if (match && req.method === 'POST') {
          const profileId = match[1];
          manager.launchProfile(profileId)
            .then((session) => {
              // Record session in database
              const db = getDatabase();
              const sessionRecord = db.createSession({
                profile_id: profileId,
                status: 'active',
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ session, dbSession: sessionRecord }));
            })
            .catch((err: any) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            });
        }

        // POST /api/profiles/:id/close — close a profile
        const closeMatch = req.url?.match(/^\/([^/]+)\/close$/);
        if (closeMatch && req.method === 'POST') {
          const profileId = closeMatch[1];
          manager.closeSession(profileId)
            .then(() => {
              const db = getDatabase();
              const activeSession = db.getActiveSessions().find(
                (s) => s.profile_id === profileId
              );
              if (activeSession) {
                db.endSession(activeSession.id);
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            })
            .catch((err: any) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            });
        }

        // DELETE /api/profiles/:id — delete a profile
        const deleteMatch = req.url?.match(/^\/([^/]+)$/);
        if (deleteMatch && req.method === 'DELETE') {
          const profileId = deleteMatch[1];
          const success = manager.deleteProfile(profileId);
          if (success) {
            const db = getDatabase();
            db.deleteBrowserProfile(profileId);
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success }));
        }
      });

      // GET /api/sessions — list sessions
      server.middlewares.use('/api/sessions', (req, res) => {
        if (req.method === 'GET') {
          const db = getDatabase();
          const sessions = db.getAllSessions();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(sessions));
        }
      });

      // GET /api/test-runs — list test runs
      server.middlewares.use('/api/test-runs', (req, res) => {
        if (req.method === 'GET') {
          const db = getDatabase();
          const runs = db.getAllTestRuns();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(runs));
        }
      });

      // POST /api/test-runs/:id/run — run a test
      server.middlewares.use('/api/test-runs', (req, res) => {
        const match = req.url?.match(/^\/([^/]+)\/run$/);
        if (match && req.method === 'POST') {
          const runId = match[1];
          // This would trigger a test run
          // For now, just return the run info
          const db = getDatabase();
          const run = db.getTestRunById(runId);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(run));
        }
      });
    },
  };
}
