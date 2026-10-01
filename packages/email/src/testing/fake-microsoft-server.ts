/**
 * Fake Microsoft Graph + OAuth server for unit tests.
 *
 * Simulates Microsoft's OAuth endpoints and Graph REST API so tests run with
 * zero network dependency and zero real credentials.
 */

import http from 'node:http';
import type { MicrosoftGraphHttpClient } from '../microsoft-graph-provider.js';

export interface FakeMgTokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface FakeMgServerOptions {
  /** Pre-seeded token data. Defaults to a fixed pair. */
  tokens?: FakeMgTokenData;
  /** Whether to simulate a delayed response. */
  delayMs?: number;
  /** Whether to simulate rate-limit (429) on the next request. */
  rateLimitNext?: boolean;
  /** Optional custom messages to return. */
  messages?: Array<{ id: string; subject: string; body: string; from: string; isRead: boolean }>;
}

export function createFakeMicrosoftGraphServer(port: number, options: FakeMgServerOptions = {}): {
  server: http.Server;
  authEndpoint: string;
  tokenEndpoint: string;
  apiBase: string;
  createHttpClient: () => MicrosoftGraphHttpClient;
  setRateLimit: (v: boolean) => void;
} {
  const {
    tokens = { accessToken: 'fake-mg-token', refreshToken: 'fake-mg-refresh', expiresIn: 3600 },
    messages = []
  } = options;

  // Seed default messages if none provided
  const messagesStore = new Map(messages.length > 0
    ? messages.map(m => [m.id, m])
    : [
        ['mg-msg-1', { id: 'mg-msg-1', subject: 'Test Subject 1', body: 'Test body message 1', from: 'test@example.com', isRead: false }],
        ['mg-msg-2', { id: 'mg-msg-2', subject: 'Test Subject 2', body: 'Test body message 2', from: 'test2@example.com', isRead: true }],
      ]
  );

  let actualPort = port;
  let portReady = false;
  let currentRateLimit = false;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '', `http://127.0.0.1:${actualPort}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // Rate limit simulation
    if (currentRateLimit && (pathname.startsWith('/me') || pathname.startsWith('/users/me'))) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate_limited', error_description: 'Too many requests' }));
      return;
    }

    // ── OAuth token endpoint ─────────────────────────────────────────────
    if (pathname === '/common/oauth2/v2.0/token' || pathname.includes('/token')) {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const grantType = params.get('grant_type');

        if (grantType === 'authorization_code') {
          const code = params.get('code');
          if (!code) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid authorization code' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
            scope: 'Mail.Read User.Read offline_access',
          }));
        } else if (grantType === 'refresh_token') {
          const refreshToken = params.get('refresh_token');
          if (refreshToken !== tokens.refreshToken) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid refresh token' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'new-fake-mg-token',
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
          }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
        }
      });
      return;
    }

    // ── Microsoft Graph API: messages ────────────────────────────────────
    if (pathname.startsWith('/me/messages') || pathname.startsWith('/users/me/messages')) {
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== tokens.accessToken) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'invalidAuthentication' }));
        return;
      }

      if (method === 'GET' && pathname.match(/\/(me|users\/me)\/messages\/[^/]+$/)) {
        const messageId = pathname.split('/').pop();
        const msg = messagesStore.get(messageId ?? '');
        if (!msg) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'itemNotFound' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: msg.id,
          subject: msg.subject,
          body: { content: msg.body, contentType: 'text' },
          from: { emailAddress: { address: msg.from, name: msg.from } },
          receivedDateTime: new Date().toISOString(),
          isRead: msg.isRead,
        }));
      } else if (method === 'GET' && pathname.match(/^\/(me|users\/me)\/messages/)) {
        const top = parseInt(url.searchParams.get('$top') ?? '50');
        const skip = parseInt(url.searchParams.get('$skip') ?? '0');
        const items = Array.from(messagesStore.values()).slice(skip, skip + top);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: items }));
      } else if (method === 'PATCH' && pathname.match(/\/(me|users\/me)\/messages\/[^/]+$/)) {
        let patchBody = '';
        req.on('data', chunk => patchBody += chunk.toString());
        req.on('end' as any, () => {
          try {
            const patch = JSON.parse(patchBody);
            const mid = pathname.split('/').pop() ?? '';
            const msg = messagesStore.get(mid);
            if (msg && patch.isRead !== undefined) {
              messagesStore.set(mid, { ...msg, isRead: patch.isRead });
            }
            res.writeHead(204);
            res.end();
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'invalidJson' }));
          }
        });
      } else if (url.searchParams.has('$search')) {
        // Search endpoint
        const query = url.searchParams.get('$search')?.replace(/"/g, '') ?? '';
        const top = parseInt(url.searchParams.get('$top') ?? '50');
        const filtered = Array.from(messagesStore.values())
          .filter(m => m.subject.toLowerCase().includes(query.toLowerCase()) || m.body.toLowerCase().includes(query.toLowerCase()))
          .slice(0, top);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: filtered }));
      } else {
        res.writeHead(404);
        res.end();
      }
      return;
    }

    // ── Microsoft Graph API: mailFolders ─────────────────────────────────
    if (pathname.startsWith('/me/mailFolders') || pathname.startsWith('/users/me/mailFolders')) {
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== tokens.accessToken) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        value: [
          { id: 'inbox', displayName: 'Inbox', parentFolderId: '' },
          { id: 'deleted', displayName: 'Deleted Items', parentFolderId: '' },
          { id: 'drafts', displayName: 'Drafts', parentFolderId: '' },
        ]
      }));
      return;
    }

    // ── Microsoft Graph API: unread count ────────────────────────────────
    if (pathname.includes('mailFolders/inbox/messages') && pathname.includes('isRead')) {
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== tokens.accessToken) {
        res.writeHead(401);
        res.end();
        return;
      }
      const unreadCount = Array.from(messagesStore.values()).filter(m => !m.isRead).length;
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        '@odata.count': String(unreadCount),
      });
      res.end(JSON.stringify({ value: [] }));
      return;
    }

    // ── User info ────────────────────────────────────────────────────────
    if (pathname === '/me') {
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== tokens.accessToken) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        mail: 'test@example.com', 
        userPrincipalName: 'test@example.com' 
      }));
      return;
    }

    // Default 404
    res.writeHead(404);
    res.end();
  });

  // Wait for server to start and capture actual port
  if (port === 0) {
    server.listen(0, '127.0.0.1', () => {
      actualPort = (server.address() as any)?.port ?? 0;
      portReady = true;
    });
  } else {
    server.listen(port, '127.0.0.1');
    portReady = true;
  }

  function createHttpClient(): MicrosoftGraphHttpClient {
    return {
      request(url: string, options: RequestInit): Promise<Response> {
        return new Promise((resolve, reject) => {
          const parsedUrl = new URL(url);
          const reqPort = parsedUrl.port ? parseInt(parsedUrl.port) : actualPort;
          const host = '127.0.0.1';
          
          const req = http.request({
            hostname: host,
            port: reqPort,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method,
            headers: {
              ...(options.headers as Record<string, string> ?? {}),
              'Content-Length': Buffer.byteLength(options.body as string ?? ''),
            },
          }, (resp) => {
            let data = '';
            resp.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            resp.on('end', () => {
              const mockHeaders = new Map<string, string>();
              for (const [key, value] of Object.entries(resp.headers)) {
                mockHeaders.set(key.toLowerCase(), String(value));
              }
              resolve({
                ok: resp.statusCode! >= 200 && resp.statusCode! < 300,
                status: resp.statusCode!,
                statusText: resp.statusMessage ?? '',
                headers: { get: (name: string) => mockHeaders.get(name.toLowerCase()) ?? null },
                json: async () => {
                  try { return JSON.parse(data); } catch { return data; }
                },
                text: async () => data,
              } as any);
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
    authEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`,
    tokenEndpoint: `http://127.0.0.1:${actualPort}/common/oauth2/v2.0/token`,
    get apiBase() {
      return `http://127.0.0.1:${actualPort}`;
    },
    createHttpClient,
    setRateLimit(v: boolean) {
      currentRateLimit = v;
    },
  };
}
