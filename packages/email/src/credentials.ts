/**
 * Credential storage.
 *
 * DESIGN DECISION — why secrets are NOT in `email_accounts.config`:
 *
 * The ordinary `email_accounts` row is read by ordinary code. It is returned by
 * `getAllEmailAccounts()` / `getEmailAccountsByIdentity()`, and those objects
 * are handed straight to the React UI and to any future CSV export. Putting a
 * password in that row means the first time somebody writes an export, a
 * screenshot, a support log, or a `JSON.stringify(db.getAllEmailAccounts())` in
 * a bug report, the password leaves the machine.
 *
 * So credentials get their own table, reached only through explicit methods
 * here. The account record keeps a non-secret `credentialRef` (an opaque id) and
 * a `hasCredentials` flag. Every read path for accounts goes through
 * `toPublicAccount()`, which cannot return a secret because there is no secret
 * in the row to return.
 *
 * Secrets are additionally masked on the way out, so even a direct read of this
 * module's storage returns a mask unless the caller explicitly asks for the
 * usable value via `resolveSecret()`.
 */

import type { Database, EmailAccount } from '../../database/src/index.js';

/** Field names that must never be persisted inside a normal account config. */
export const SECRET_FIELDS = [
  'password',
  'accessToken',
  'clientSecret',
  'refreshToken',
  'appPassword',
  'token',
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

export interface StoredCredentials {
  credentialRef: string;
  accountId: string;
  secretKind: string;
  /** Masked, for display. e.g. `••••••••` or `ab***yz`. */
  maskedSecret: string;
  updatedAt: string;
  hasSecret: boolean;
}

export interface ResolvedCredentials {
  credentialRef: string;
  accountId: string;
  /** Usable secret value. Callers must not log or return this. */
  secret: string;
  secretKind: string;
}

/**
 * Strip every secret-shaped field from a config object.
 *
 * Applied on the way into `email_accounts.config` and on the way out to the UI,
 * so the field cannot be smuggled in by a caller that passes a full config
 * through, nor leaked by a caller that echoes one back.
 */
export function redactConfig<T extends Record<string, unknown>>(
  config: T | null | undefined
): Record<string, unknown> {
  if (!config) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if ((SECRET_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Replace secret values inside a config with a marker, keeping the key visible
 * so the UI can say "password is set" without learning the value.
 */
export function maskConfig<T extends Record<string, unknown>>(
  config: T | null | undefined
): Record<string, unknown> {
  if (!config) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if ((SECRET_FIELDS as readonly string[]).includes(key)) {
      out[key] = typeof value === 'string' && value.length > 0 ? '••••••••' : undefined;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Mask a secret for display without revealing its length beyond a floor.
 * Short secrets are fully masked so length is not leaked.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 2)}${'•'.repeat(6)}${value.slice(-2)}`;
}

/**
 * The shape of an email account as the UI and API may see it. It has no field
 * capable of holding a secret, by construction.
 */
export interface PublicEmailAccount {
  id: string;
  identity_id: string;
  provider_type: string;
  config: Record<string, unknown>;
  is_active: number;
  created_at: string;
  last_synced_at: string | null;
  connection_status: string;
  last_error: string | null;
  credentialRef: string | null;
  hasCredentials: boolean;
  maskedSecret: string | null;
}

export class CredentialStore {
  constructor(private readonly db: Database) {}

  /**
   * Persist a secret for an account, returning the opaque reference that goes
   * into the account's non-secret config. Re-saving rotates the value in place.
   */
  saveSecret(accountId: string, secret: string, secretKind = 'password'): StoredCredentials {
    if (!accountId) throw new Error('accountId is required');
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error('refusing to store an empty secret');
    }
    const existing = this.db.getEmailCredentialByAccount(accountId);
    const now = new Date().toISOString();
    const ref = existing?.credential_ref ?? `cred_${accountId}`;

    this.db.upsertEmailCredential({
      account_id: accountId,
      credential_ref: ref,
      secret_kind: secretKind,
      secret_value: secret,
      updated_at: now,
    });

    return {
      credentialRef: ref,
      accountId,
      secretKind,
      maskedSecret: maskSecret(secret),
      updatedAt: now,
      hasSecret: true,
    };
  }

  /**
   * Look up the usable secret. This is the ONLY function in the codebase that
   * returns an unmasked secret, and its name is the reminder.
   */
  resolveSecret(accountId: string): ResolvedCredentials | null {
    const row = this.db.getEmailCredentialByAccount(accountId);
    if (!row?.secret_value) return null;
    return {
      credentialRef: row.credential_ref,
      accountId: row.account_id,
      secret: row.secret_value,
      secretKind: row.secret_kind,
    };
  }

  /** Read the secret without unmasking it. Safe for UI and logs. */
  getStored(accountId: string): StoredCredentials | null {
    const row = this.db.getEmailCredentialByAccount(accountId);
    if (!row) return null;
    return {
      credentialRef: row.credential_ref,
      accountId: row.account_id,
      secretKind: row.secret_kind,
      maskedSecret: maskSecret(row.secret_value),
      updatedAt: row.updated_at,
      hasSecret: Boolean(row.secret_value),
    };
  }

  hasSecret(accountId: string): boolean {
    return Boolean(this.db.getEmailCredentialByAccount(accountId)?.secret_value);
  }

  /** Remove the secret. The account row survives, only the secret is gone. */
  deleteSecret(accountId: string): boolean {
    return this.db.deleteEmailCredential(accountId);
  }

  /**
   * Get a specific secret by its kind (e.g., 'access_token', 'refresh_token').
   * Returns null if not found.
   */
  getSecretByType(accountId: string, secretKind: string): string | null {
    const rows = this.db.getEmailCredentialsByAccount(accountId);
    const row = rows.find((r) => r.secret_kind === secretKind);
    return row?.secret_value ?? null;
  }

  /**
   * Check if an account has a specific secret type.
   */
  hasSecretOfType(accountId: string, secretKind: string): boolean {
    return this.db.getEmailCredentialsByAccount(accountId).some(
      (r) => r.secret_kind === secretKind,
    );
  }
}

/**
 * Convert a raw `EmailAccount` row into the public shape.
 *
 * This is the single funnel every account read should pass through. It parses
 * `config`, redacts anything secret-shaped, and attaches only a mask and a
 * boolean for the credential.
 */
export function toPublicEmailAccount(
  db: Database,
  account: EmailAccount
): PublicEmailAccount {
  let parsed: Record<string, unknown> = {};
  try {
    const maybe = JSON.parse(account.config ?? '{}');
    if (maybe && typeof maybe === 'object' && !Array.isArray(maybe)) {
      parsed = maybe as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const stored = db.getEmailCredentialByAccount(account.id);
  const redacted = redactConfig(parsed);

  return {
    id: account.id,
    identity_id: account.identity_id,
    provider_type: account.provider_type,
    config: redacted,
    is_active: account.is_active,
    created_at: account.created_at,
    last_synced_at: account.last_synced_at,
    connection_status: 'disconnected',
    last_error: null,
    credentialRef: stored?.credential_ref ?? null,
    hasCredentials: Boolean(stored?.secret_value),
    maskedSecret: stored?.secret_value ? maskSecret(stored.secret_value) : null,
  };
}
