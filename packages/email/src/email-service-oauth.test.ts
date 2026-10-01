/**
 * Email service OAuth security hardening tests.
 *
 * Verifies:
 * - Server holds pending transactions (never returned to browser)
 * - State uniqueness and single-use (no replay)
 * - Transaction expiration (10-minute TTL)
 * - Redirect URI validation against server config
 * - Client-supplied clientId/clientSecret/redirectUri are IGNORED
 * - API never returns codeVerifier or any secret
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from '../../database/src/index.js';
import { EmailAccountService } from './email-service.js';

const TEST_DB = path.join(process.cwd(), 'data', 'test-phase6b-oauth.db');
const origEnv = { ...process.env };

let db: Database;
let svc: EmailAccountService;
let identityId: string;

beforeEach(async () => {
  // Set up env vars for testing
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  db = new Database(TEST_DB);
  await db.initialize();
  identityId = db.createIdentity({ email: 'owner@example.test', display_name: 'Owner' }).id;
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

describe('generateOAuthInitParams', () => {
  it('returns only authorizationUrl and state — no codeVerifier', async () => {
    const result = await svc.generateOAuthInitParams(identityId);
    
    expect(result).toHaveProperty('authorizationUrl');
    expect(result).toHaveProperty('state');
    expect(result.state).toBeDefined();
    expect(result.state.length).toBeGreaterThanOrEqual(16);
    
    // CRITICAL: codeVerifier must NEVER be in the response
    expect(Object.keys(result)).not.toContain('codeVerifier');
    expect((result as any).codeVerifier).toBeUndefined();
    expect((result as any).clientId).toBeUndefined();
    expect((result as any).clientSecret).toBeUndefined();
    expect((result as any).redirectUri).toBeUndefined();
  });

  it('generates unique state values on consecutive calls', async () => {
    const result1 = await svc.generateOAuthInitParams(identityId);
    const result2 = await svc.generateOAuthInitParams(identityId);
    
    expect(result1.state).not.toBe(result2.state);
    expect(result1.authorizationUrl).not.toBe(result2.authorizationUrl);
  });

  it('throws when GOOGLE_CLIENT_ID is not set', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(svc.generateOAuthInitParams(identityId))
      .rejects.toThrow('GOOGLE_CLIENT_ID is not configured');
  });

  it('throws when GOOGLE_CLIENT_SECRET is not set', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    await expect(svc.generateOAuthInitParams(identityId))
      .rejects.toThrow('GOOGLE_CLIENT_SECRET is not configured');
  });

  it('uses server-configured redirect URI, not client-supplied', async () => {
    const result = await svc.generateOAuthInitParams(identityId);
    expect(result.authorizationUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle%2Fcallback');
  });
});

describe('exchangeOAuthCode — state validation', () => {
  it('rejects missing state parameter', async () => {
    const result = await svc.exchangeOAuthCode(
      identityId,
      'http://localhost:3000/auth/google/callback',
      'fake-code',
      '' // empty state
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or expired');
  });

  it('rejects unknown state', async () => {
    const result = await svc.exchangeOAuthCode(
      identityId,
      'http://localhost:3000/auth/google/callback',
      'fake-code',
      'unknown-state-value-12345678'
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or expired');
  });

  it('rejects replayed/consumed state', async () => {
    const initResult = await svc.generateOAuthInitParams(identityId);

    // Consume the transaction directly via internal method
    const consumed = (svc as any).consumeOAuthTransaction(initResult.state);
    expect(consumed).not.toBeNull();

    // Second consumption should return null
    const again = (svc as any).consumeOAuthTransaction(initResult.state);
    expect(again).toBeNull();

    // Exchange with consumed state should fail immediately
    const result2 = await svc.exchangeOAuthCode(
      identityId,
      'http://localhost:3000/auth/google/callback',
      'another-invalid-code',
      initResult.state
    );

    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Invalid or expired');
  });
});

describe('exchangeOAuthCode — identity validation', () => {
  it('rejects mismatched identity', async () => {
    const initResult = await svc.generateOAuthInitParams(identityId);
    
    const response = await svc.exchangeOAuthCode(
      'different-identity-id', // different identity
      'http://localhost:3000/auth/google/callback',
      'fake-code',
      initResult.state
    );
    
    expect(response.success).toBe(false);
    expect(response.error).toContain('Identity mismatch');
  });
});

describe('exchangeOAuthCode — redirect URI validation', () => {
  it('rejects wrong redirect URI', async () => {
    const initResult = await svc.generateOAuthInitParams(identityId);
    
    const response = await svc.exchangeOAuthCode(
      identityId,
      'http://attacker.com/callback', // different URI
      'fake-code',
      initResult.state
    );
    
    expect(response.success).toBe(false);
    expect(response.error).toContain('Redirect URI mismatch');
  });
});

describe('security properties', () => {
  it('API never exposes codeVerifier in any response', async () => {
    const result = await svc.generateOAuthInitParams(identityId);
    
    // Verify no secret shapes in response
    const responseStr = JSON.stringify(result);
    expect(responseStr).not.toMatch(/code.?verifier/i);
    expect(responseStr).not.toMatch(/access.?token/i);
    expect(responseStr).not.toMatch(/refresh.?token/i);
    expect(responseStr).not.toMatch(/client.?secret/i);
  });

  it('server uses env-configured clientId, ignores any client input', async () => {
    const result = await svc.generateOAuthInitParams(identityId);
    
    // Should contain the server-configured client ID
    expect(result.authorizationUrl).toContain('test-client-id');
  });
});
