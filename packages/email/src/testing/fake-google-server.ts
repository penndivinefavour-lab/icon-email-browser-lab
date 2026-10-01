/**
 * Fake OAuth + Gmail API server for unit tests.
 *
 * Simulates Google's OAuth endpoints and Gmail REST API so tests run with zero
 * network dependency and zero real credentials.
 *
 * Usage:
 *   const fake = createFakeGoogleServer(port);
 *   const provider = new GmailProvider(config, accountId, identityId, tokenLoader, {
 *     httpClient: fake.createHttpClient(basePort),
 *   });
 */

import http from 'node:http';
import crypto from 'node:crypto';
import type { GmailHttpClient } from '../gmail-provider.js';

export interface FakeTokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface FakeServerOptions {
  /** Pre-seeded token data. Defaults to a fixed pair. */
  tokens?: FakeTokenData;
  /** Whether to simulate a delayed response. */
  delayMs?: number;
  /** Whether to simulate rate-limit (429) on the next request. */
  rateLimitNext?: boolean;
}

let rateLimited = false;

export function createFakeGoogleServer(port: number, options: FakeServerOptions = {}): {
  server: http.Server;
  authEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint: string;
  userinfoEndpoint: string;
  /** Real base URL for the fake Gmail API once the server is listening. */
  get gmailBase(): string;
  createHttpClient: () => GmailHttpClient;
  setRateLimit: (v: boolean) => void;
  invalidateRefreshToken: () => void;
} {
  const { tokens = { accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token', expiresIn: 3600 } } = options;
  let invalidRefresh = false;
  let actualPort = port || 0;

  const messagesStore = new Map<string, Record<string, unknown>>();
  let messageCounter = 0;

  function seedMessages(count: number): void {
    for (let i = 0; i < count; i++) {
      const id = `fake-msg-${++messageCounter}`;
      messagesStore.set(id, {
        id,
        threadId: `thread-${i % 5}`,
        labelIds: i % 3 === 0 ? ['UNREAD'] : [],
        snippet: `Test message ${i + 1}`,
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.test' },
            { name: 'To', value: 'recipient@example.test' },
            { name: 'Subject', value: `Test Subject ${i + 1}` },
            { name: 'Date', value: new Date(Date.now() - i * 60000).toUTCString() },
            { name: 'Message-ID', value: `<${id}@test>` },
          ],
          mimeType: 'multipart/mixed',
          parts: [
            {
              partId: '0',
              mimeType: 'text/plain',
              filename: '',
              headers: [],
              body: { size: 10, data: btoa(`Test body message ${i + 1}`) },
            },
          ],
        },
        internalDate: String(Date.now() - i * 60000),
      });
    }
  }
  seedMessages(10);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const pathname = url.pathname;

    // ── OAuth token endpoint ─────────────────────────────────────────────
    if (pathname === '/oauth2/v4/token' || pathname === '/token') {
      res.setHeader('Content-Type', 'application/json');

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const grantType = params.get('grant_type');
        const code = params.get('code');
        const refreshToken = params.get('refresh_token');
        const clientId = params.get('client_id');
        const clientSecret = params.get('client_secret');

        // Validation
        if (!clientId || clientId !== 'fake-client-id') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'invalid_client' }));
          return;
        }
        if (!clientSecret || clientSecret !== 'fake-client-secret') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'invalid_client' }));
          return;
        }

        // Code exchange
        if (grantType === 'authorization_code' && code) {
          if (code !== 'fake-auth-code') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify({
            access_token: tokens.accessToken,
            token_type: 'Bearer',
            expires_in: tokens.expiresIn,
            refresh_token: invalidRefresh ? 'revoked-refresh-token' : tokens.refreshToken,
            scope: 'openid https://www.googleapis.com/auth/gmail.readonly',
            id_token: 'fake.id.token',
          }));
          return;
        }

        // Refresh token
        if (grantType === 'refresh_token' && refreshToken) {
          if (invalidRefresh || refreshToken === 'revoked-refresh-token') {
            res.writeHead(400);
            res.end(JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Token has been revoked or expired.',
            }));
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify({
            access_token: `fresh-${Date.now()}`,
            token_type: 'Bearer',
            expires_in: tokens.expiresIn,
            refresh_token: tokens.refreshToken,
          }));
          return;
        }

        res.writeHead(400);
        res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
      });
      return;
    }

    // ── OAuth revoke endpoint ────────────────────────────────────────────
    if (pathname === '/revoke') {
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // ── OpenID userinfo ──────────────────────────────────────────────────
    if (pathname === '/oauth2/v3/userinfo' || pathname === '/v1/userinfo') {
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== tokens.accessToken) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'invalid_token' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ sub: '123456789', email: 'test@example.test', email_verified: true }));
      return;
    }

    // ── Gmail API: messages.list ───────────────────────────────────────────
    // Match both /gmail/v1/users/me/messages and /users/me/messages (for testing)
    if (pathname.startsWith('/gmail/v1/users/me/messages') || pathname === '/users/me/messages') {
      const auth = req.headers.authorization ?? '';
      // Accept any Bearer token for testing; in production, validate against expected.
      if (rateLimited) {
        rateLimited = false;
        res.writeHead(429);
        res.end(JSON.stringify({ error: { code: 429, message: 'User Rate Limit Exceeded' } }));
        return;
      }

      const params = new URLSearchParams(url.search);
      const maxResults = Math.min(parseInt(params.get('maxResults') ?? '100') || 100, 500);
      const q = params.get('q');

      let list = Array.from(messagesStore.values());
      if (q) {
        const needle = q.toLowerCase();
        list = list.filter((m) => {
          const payload = m.payload as { headers?: Array<{ name: string; value: string }> };
          const headersStr = (payload?.headers ?? []).map((h) => h.value).join(' ').toLowerCase();
          return headersStr.includes(needle);
        });
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        messages: list.slice(0, maxResults).map((m) => ({ id: m.id, threadId: m.threadId })),
        resultSizeEstimate: list.length,
      }));
      return;
    }

    // ── Gmail API: labels ──────────────────────────────────────────────────
    if (pathname === '/gmail/v1/users/me/labels' || pathname === '/users/me/labels') {
      res.writeHead(200);
      res.end(JSON.stringify({
        labels: [
          { id: 'INBOX', name: 'Inbox', type: 'system' },
          { id: 'UNREAD', name: 'UNREAD', type: 'system' },
          { id: 'SENT', name: 'Sent', type: 'system' },
          { id: 'TRASH', name: 'Trash', type: 'system' },
        ],
      }));
      return;
    }

    // ── Gmail API: UNREAD count ──────────────────────────────────────────
    if (pathname.includes('/labels/label.UNREAD/numMessages')) {
      const unreadCount = Array.from(messagesStore.values()).filter((m) =>
        (m.labelIds as string[])?.includes('UNREAD')
      ).length;
      res.writeHead(200);
      res.end(JSON.stringify({ total: unreadCount }));
      return;
    }

    // ── Gmail API: modify (mark as read) — check BEFORE get ──────────────
    const modifyMatch = pathname.match(/^\/(?:gmail\/v1\/)?users\/me\/messages\/[^/]+\/modify$/);
    if (modifyMatch) {
      res.writeHead(200);
      res.end(JSON.stringify({}));
      return;
    }

    // ── Gmail API: messages.get ──────────────────────────────────────────
    const msgMatch = pathname.match(/^\/(?:gmail\/v1\/)?users\/me\/messages\/([^?]+)/);
    if (msgMatch) {
      // Accept any Bearer token for testing
      const msgId = msgMatch[1];
      const msg = messagesStore.get(msgId);
      if (!msg) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'NOT_FOUND' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(msg));
      return;
    }

    // Default 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  server.listen(port, '127.0.0.1', () => {
    // Server ready
  });

  const baseUrl = `http://127.0.0.1:${actualPort}`;

  function createHttpClient(): GmailHttpClient {
    return {
      request(url: string, options: RequestInit): Promise<Response> {
        return new Promise((resolve, reject) => {
          const parsed = new URL(url);
          // Use dynamic port resolution so tests work even when OS assigns random port
          const serverPort = (server.address() as any)?.port ?? actualPort;
          const targetPort = parsed.port ? parseInt(parsed.port) : serverPort;
          const path = parsed.pathname + parsed.search;
          const requestOptions: http.RequestOptions = {
            hostname: '127.0.0.1',
            port: targetPort || 80,
            path,
            method: options.method ?? 'GET',
            headers: {
              ...(options.headers as Record<string, string> ?? {}),
              'Content-Type': 'application/json',
            },
          };
          if (options.body) {
            requestOptions.headers = {
              ...(options.headers as Record<string, string> ?? {}),
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(options.body as string),
            };
          } else {
            requestOptions.headers = {
              ...(options.headers as Record<string, string> ?? {}),
              'Content-Type': 'application/json',
            };
          }

          const req = http.request(requestOptions, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              const body = Buffer.concat(chunks).toString();
              resolve({
                ok: res.statusCode! >= 200 && res.statusCode! < 300,
                status: res.statusCode!,
                statusText: res.statusMessage ?? '',
                headers: res.headers as Record<string, string>,
                json: async () => {
                  try { return JSON.parse(body); } catch { return body; }
                },
                text: async () => body,
              } as unknown as Response);
            });
          });
          req.on('error', reject);
          if (options.body) req.write(options.body as string);
          req.end();
        });
      },
    };
  }

  return {
    server,
    authEndpoint: `https://accounts.google.com/o/oauth2/v2/auth`, // real endpoint, tests use fake for token
    tokenEndpoint: `${baseUrl}/oauth2/v4/token`,
    revokeEndpoint: `${baseUrl}/revoke`,
    userinfoEndpoint: `${baseUrl}/oauth2/v3/userinfo`,
    get gmailBase() {
      const p = (server.address() as any)?.port ?? actualPort;
      return `http://127.0.0.1:${p}`;
    },
    createHttpClient,
    setRateLimit(v: boolean) { rateLimited = v; },
    invalidateRefreshToken() { invalidRefresh = true; },
  };
}

/** Generate a cryptographically secure state string. */
export function generateState(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/** Generate a PKCE code_verifier (43-128 chars). */
export function generateCodeVerifier(length = 64): string {
  return crypto.randomBytes(length).toString('base64url');
}

/** Compute the PKCE code_challenge from a verifier (SHA-256, base64url). */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build the Google OAuth authorization URL. */
export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
  prompt?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: opts.scopes.join(' '),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    ...(opts.prompt ? { prompt: opts.prompt } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
