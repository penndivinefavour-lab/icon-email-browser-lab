/**
 * Vite Plugin: Email Provider API
 *
 * Local-only middleware mounted on the underlying HTTP server (same approach as
 * browserProfileApi) so it fires before Vite's internal handler.
 *
 * SECURITY CONTRACT:
 *   • A response body is built only from EmailAccountService public views,
 *     which carry a masked secret and a boolean — never a plaintext credential.
 *   • There is no route that returns a stored secret.
 *   • The raw request body is never logged.
 *   • Errors are scrubbed before they leave the service layer.
 */

import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDatabase, ensureDbInitialized } from './packages/database/src/index';
import { EmailAccountService } from './packages/email/src/email-service';
import path from 'path';

const PLUGIN_ROOT = path.resolve(__dirname);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  for (const [k, v] of Object.entries(JSON_HEADERS)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          resolve(parsed as Record<string, unknown>);
        } else {
          reject(new Error('Request body must be a JSON object'));
        }
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function statusForError(code: string | undefined): number {
  switch (code) {
    case 'CONFIG_INVALID':
    case 'AUTH_FAILED':
    case 'MAILBOX_NOT_FOUND':
      return 400;
    case 'TIMEOUT':
      return 504;
    case 'TLS_FAILED':
    case 'CONNECTION_FAILED':
      return 502;
    default:
      return 500;
  }
}

export function emailProviderApi(): Plugin {
  return {
    name: 'email-provider-api',
    configureServer(server) {
      const service = async () => {
        const db = getDatabase();
        await ensureDbInitialized(db);
        return new EmailAccountService(db);
      };

      const onRequest = (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const pathname = url.pathname;

        // ── /api/email/providers ────────────────────────────────────────
        if (pathname === '/api/email/providers') {
          return send(res, 200, [
            { type: 'mock', label: 'Mock (local)', status: 'ready', requiresCredentials: false },
            { type: 'imap', label: 'IMAP (imapflow 2.1.2)', status: 'ready', requiresCredentials: true },
            { type: 'gmail', label: 'Gmail (OAuth2)', status: 'planned', requiresCredentials: true },
            { type: 'outlook', label: 'Outlook (Microsoft Graph)', status: 'planned', requiresCredentials: true },
          ]);
        }

        // ── /api/email/accounts ─────────────────────────────────────────
        if (pathname === '/api/email/accounts') {
          if (req.method === 'GET') {
            const identityId = url.searchParams.get('identityId');
            try {
              const accounts = identityId
                ? service().getAccountsByIdentity(identityId)
                : service().getAllAccounts();
              return send(res, 200, accounts);
            } catch (err) {
              return send(res, 500, { error: (err as Error).message });
            }
          }
          if (req.method === 'POST') {
            readJson(req).then((body) => {
              const identityId = String(body.identityId ?? '');
              const providerType = String(body.providerType ?? 'mock');
              if (!identityId) {
                return send(res, 400, { error: 'identityId is required', code: 'CONFIG_INVALID' });
              }
              try {
                const created = service().saveAccount({
                  identityId,
                  providerType,
                  config: (body.config as Record<string, unknown>) ?? {},
                  ...(typeof body.password === 'string' ? { password: body.password } : {}),
                  isActive: body.isActive !== false,
                });
                return send(res, 201, created);
              } catch (err: unknown) {
                const e = err as Error & { code?: string };
                return send(res, statusForError(e.code), { error: e.message, code: e.code ?? 'UNKNOWN' });
              }
            }).catch(() => send(res, 400, { error: 'Bad request' }));
            return;
          }
          return send(res, 405, { error: 'Method not allowed' });
        }

        // ── /api/email/accounts/:id[...] ────────────────────────────────
        const match = pathname.match(/^\/api\/email\/accounts\/([^/]+)(?:\/([^/]+))?$/);
        if (match) {
          const [, accountId, action] = match;
          const svc = service();

          if (req.method === 'PUT' && !action) {
            readJson(req)
              .then((body) => {
                const updated = body.password
                  ? svc.updateSecret(accountId, String(body.password)) ?? svc.updateConfig(accountId, {})
                  : svc.updateConfig(accountId, (body.config as Record<string, unknown>) ?? {});
                if (!updated) return send(res, 404, { error: 'Email account not found' });
                return send(res, 200, updated);
              })
              .catch((err: Error) => send(res, 400, { error: err.message }));
            return;
          }

          if (req.method === 'DELETE' && !action) {
            const ok = svc.deleteAccount(accountId);
            return send(res, ok ? 200 : 404, { success: ok });
          }

          if (req.method === 'POST' && action === 'test') {
            svc.testConnection(accountId)
              .then((result) => send(res, result.success ? 200 : statusForError(result.errorCode), result))
              .catch((err: Error) => send(res, 500, { error: err.message }));
            return;
          }

          if (req.method === 'GET' && action === 'mailboxes') {
            svc.listMailboxes(accountId)
              .then((folders) => send(res, 200, folders))
              .catch((err: Error & { code?: string }) =>
                send(res, statusForError(err.code), { error: err.message, code: err.code ?? 'UNKNOWN' })
              );
            return;
          }

          if (req.method === 'POST' && action === 'messages') {
            readJson(req)
              .then((body) => svc.fetchMessages(accountId, Number(body.limit ?? 25)))
              .then((result) => send(res, 200, result))
              .catch((err: Error & { code?: string }) =>
                send(res, statusForError(err.code), { error: err.message, code: err.code ?? 'UNKNOWN' })
              );
            return;
          }

          return send(res, 404, { error: 'Unknown email route' });
        }

        // Not our route — let Vite handle it
      };

      server.httpServer?.on('request', onRequest);
    },
  };
}
