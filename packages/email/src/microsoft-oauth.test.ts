/**
 * Microsoft Graph OAuth security tests.
 *
 * Verifies server-authoritative transaction lifecycle, state management,
 * and secret isolation for Microsoft Graph OAuth flows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from '../../database/src/index.js';
import { EmailAccountService } from './email-service.js';

const TEST_DB = path.join(process.cwd(), 'data', 'test-phase6c-microsoft-oauth.db');
const origEnv = { ...process.env };

let db: Database;
let svc: EmailAccountService;
let identityId: string;

beforeEach(async () => {
  // Set up env vars for Microsoft testing
  process.env.MICROSOFT_CLIENT_ID = 'test-microsoft-client-id';
  process.env.MICROSOFT_CLIENT_SECRET = 'test-microsoft-client-secret';
  process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3000/auth/microsoft/callback';

  // Clean up test DB
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  db = new Database(TEST_DB);
  await db.initialize();
  const identity = db.createIdentity({ email: 'owner@example.test', display_name: 'Owner' });
  identityId = identity.id;
  svc = new EmailAccountService(db);
});

afterEach(() => {
  Object.assign(process.env, origEnv);
  try {
    db.close();
  } catch { /* already closed */ }
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch { /* cleanup */ }
});

describe('Microsoft Graph OAuth Security', () => {
  it('returns only authorizationUrl and state — no codeVerifier or secrets', async () => {
    const result = await (svc as any).generateMicrosoftOAuthInitParams(identityId);

    // Should have authorizationUrl and state
    expect(result.authorizationUrl).toContain('login.microsoftonline.com');
    expect(result.state).toBeDefined();
    expect(typeof result.state).toBe('string');
    expect(result.state.length).toBeGreaterThan(20);

    // CRITICAL: codeVerifier must NEVER be in the response
    expect(Object.keys(result)).not.toContain('codeVerifier');
    expect((result as any).codeVerifier).toBeUndefined();

    // No secret material in response
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain('client_secret');
    expect(resultStr).not.toContain('refresh_token');
    expect(resultStr).not.toContain('access_token');
  });

  it('generates unique state values on consecutive calls', async () => {
    const result1 = await (svc as any).generateMicrosoftOAuthInitParams(identityId);
    const result2 = await (svc as any).generateMicrosoftOAuthInitParams(identityId);

    expect(result1.state).not.toBe(result2.state);
  });

  it('throws when MICROSOFT_CLIENT_ID is not set', async () => {
    delete process.env.MICROSOFT_CLIENT_ID;

    await expect((svc as any).generateMicrosoftOAuthInitParams(identityId))
      .rejects.toThrow('MICROSOFT_CLIENT_ID is not configured');
  });

  it('throws when MICROSOFT_CLIENT_SECRET is not set', async () => {
    delete process.env.MICROSOFT_CLIENT_SECRET;

    await expect((svc as any).generateMicrosoftOAuthInitParams(identityId))
      .rejects.toThrow('MICROSOFT_CLIENT_SECRET is not configured');
  });

  it('uses server-configured redirect URI in auth URL', async () => {
    const result = await (svc as any).generateMicrosoftOAuthInitParams(identityId);

    // The redirect_uri is URL-encoded in the authorization URL
    expect(result.authorizationUrl).toContain(encodeURIComponent('http://localhost:3000/auth/microsoft/callback'));
  });

  it('rejects unknown state immediately', async () => {
    // No transaction created, so this should fail immediately
    const result = await (svc as any).exchangeMicrosoftOAuthCode(
      identityId,
      'http://localhost:3000/auth/microsoft/callback',
      'fake-code',
      'unknown-state-12345'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or expired');
  });

  it('rejects replayed/consumed state', async () => {
    const initResult = await (svc as any).generateMicrosoftOAuthInitParams(identityId);
    const state = initResult.state;

    // Consume the transaction directly
    const consumed = (svc as any).consumeOAuthTransaction(state);
    expect(consumed).not.toBeNull();

    // Second consumption should return null
    const again = (svc as any).consumeOAuthTransaction(state);
    expect(again).toBeNull();

    // Exchange should fail due to invalid state
    const result = await (svc as any).exchangeMicrosoftOAuthCode(
      identityId,
      'http://localhost:3000/auth/microsoft/callback',
      'another-code',
      state
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or expired');
  });

  it('redirect URI mismatch rejected before token exchange', async () => {
    const initResult = await (svc as any).generateMicrosoftOAuthInitParams(identityId);
    const state = initResult.state;

    // Wrong redirect URI should be caught before any network call
    const result = await (svc as any).exchangeMicrosoftOAuthCode(
      identityId,
      'http://wrong-uri.com/callback',
      'fake-code',
      state
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Redirect URI mismatch');
  });

  it('API never exposes codeVerifier in any response', async () => {
    const result = await (svc as any).generateMicrosoftOAuthInitParams(identityId);

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toMatch(/code[_-]?verifier/i);
    expect(resultStr).not.toMatch(/PKCE/i);
    expect(resultStr).not.toMatch(/secret/i);
  });

  it('server uses env-configured clientId in auth URL', async () => {
    const result = await (svc as any).generateMicrosoftOAuthInitParams(identityId);

    expect(result.authorizationUrl).toContain('test-microsoft-client-id');
  });

  it('does not validate identity exists before generating state', async () => {
    // The generate method creates state even for non-existent identities
    // (Identity validation happens later in the flow)
    const result = await (svc as any).generateMicrosoftOAuthInitParams('nonexistent-id');

    expect(result.authorizationUrl).toBeDefined();
    expect(result.state).toBeDefined();
  });

  it('state is cryptographically secure length', async () => {
    const result = await (svc as any).generateMicrosoftOAuthInitParams(identityId);

    // State should be at least 32 characters for security
    expect(result.state.length).toBeGreaterThanOrEqual(32);
  });
});
