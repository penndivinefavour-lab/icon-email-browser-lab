/**
 * Structured provider errors.
 *
 * Every error surfaced by a provider is an `EmailProviderError` so callers can
 * branch on a stable `code` instead of matching English error strings that come
 * from five different layers (Node TLS, Node net, imapflow, the provider, the UI).
 *
 * SECURITY: `message` is always safe to display. The constructor scrubs any
 * registered secret (username, password, token) out of the message before it is
 * stored, so a misbehaving upstream that echoes credentials back cannot leak
 * them into the activity log, the database, the API, or the UI.
 */

export type EmailProviderErrorCode =
  | 'CONFIG_INVALID'
  | 'AUTH_FAILED'
  | 'TLS_FAILED'
  | 'CONNECTION_FAILED'
  | 'TIMEOUT'
  | 'MAILBOX_NOT_FOUND'
  | 'NOT_CONNECTED'
  | 'ALREADY_CONNECTED'
  | 'DISCONNECT_FAILED'
  | 'PROTOCOL_ERROR'
  | 'OAUTH_FAILED'
  | 'OAUTH_STATE_MISMATCH'
  | 'TOKEN_REFRESH_FAILED'
  | 'RATE_LIMITED'
  | 'ACCOUNT_REVOKED'
  | 'UNKNOWN';

/** Substrings that indicate the failure class in raw upstream messages. */
const TLS_HINTS = [
  'certificate',
  'self signed',
  'self-signed',
  'ssl',
  'tls',
  'wrong version',
  'EPROTO',
  'ERR_TLS',
];
const AUTH_HINTS = [
  'authentication',
  'authentication failed',
  'invalid credentials',
  'login failed',
  'authenticat',
  'NO [AUTHENTICATION',
  'invalid login',
  'wrong password',
  'access denied',
];
const TIMEOUT_HINTS = ['timeout', 'timed out', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'];
const CONNECTION_HINTS = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  'closed',
  'no connection',
  'connection',
];

export interface EmailProviderErrorInit {
  code: EmailProviderErrorCode;
  message: string;
  /** Secrets to scrub from the message before it is retained. */
  secrets?: (string | undefined | null)[];
  /** Non-secret diagnostic detail, safe to log. */
  detail?: string;
  cause?: unknown;
}

export class EmailProviderError extends Error {
  readonly code: EmailProviderErrorCode;
  readonly detail?: string;
  /** True when the error is a configuration problem the user can fix in the UI. */
  readonly userActionable: boolean;

  constructor(init: EmailProviderErrorInit) {
    super(scrubSecrets(init.message, init.secrets));
    this.name = 'EmailProviderError';
    this.code = init.code;
    this.detail = init.detail;
    this.userActionable = USER_ACTIONABLE.has(init.code);
    if (init.cause !== undefined) (this as { cause?: unknown }).cause = init.cause;
  }

  /** Shape returned by the API. Contains no secrets by construction. */
  toJSON(): { code: EmailProviderErrorCode; message: string; detail?: string; userActionable: boolean } {
    return {
      code: this.code,
      message: this.message,
      ...(this.detail ? { detail: this.detail } : {}),
      userActionable: this.userActionable,
    };
  }
}

const USER_ACTIONABLE = new Set<EmailProviderErrorCode>([
  'CONFIG_INVALID',
  'AUTH_FAILED',
  'TLS_FAILED',
  'MAILBOX_NOT_FOUND',
  'NOT_CONNECTED',
  'OAUTH_FAILED',
  'ACCOUNT_REVOKED',
]);

/**
 * Escape a string for safe inclusion in a RegExp. Without this, a password
 * containing regex metacharacters would either throw or over-match.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace every occurrence of each secret with a placeholder. */
export function scrubSecrets(
  message: string,
  secrets: (string | undefined | null)[] = []
): string {
  let out = String(message ?? '');
  for (const secret of secrets) {
    if (typeof secret !== 'string') continue;
    // Very short values would redact innocuous substrings of normal text.
    if (secret.length < 4) continue;
    out = out.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]');
  }
  return out;
}

/**
 * Classify an arbitrary upstream error into an `EmailProviderError`.
 * imapflow and Node both attach a `code`; we prefer our own classification of
 * the message and fall back to the upstream code for anything unrecognised.
 */
export function classifyProviderError(
  err: unknown,
  secrets: (string | undefined | null)[] = []
): EmailProviderError {
  if (err instanceof EmailProviderError) return err;

  const raw = err as { message?: string; code?: string; response?: string } | null;
  const message = raw?.message || raw?.response || 'Unknown provider error';
  const haystack = `${message} ${raw?.code ?? ''}`.toLowerCase();

  const has = (hints: string[]) => hints.some((h) => haystack.includes(h.toLowerCase()));

  let code: EmailProviderErrorCode = 'UNKNOWN';
  if (has(TIMEOUT_HINTS) || raw?.code === 'ETIMEDOUT' || raw?.code === 'ESOCKETTIMEDOUT') {
    code = 'TIMEOUT';
  } else if (has(AUTH_HINTS)) {
    code = 'AUTH_FAILED';
  } else if (has(TLS_HINTS)) {
    code = 'TLS_FAILED';
  } else if (has(CONNECTION_HINTS)) {
    code = 'CONNECTION_FAILED';
  } else if (raw?.code === 'NotFound') {
    code = 'MAILBOX_NOT_FOUND';
  }

  return new EmailProviderError({
    code,
    message: userFacingMessage(code),
    detail: scrubSecrets(message, secrets),
    secrets,
    cause: err,
  });
}

/**
 * Replace library-specific wording with a stable, actionable sentence. The raw
 * upstream text is preserved (scrubbed) in `detail` for diagnosis.
 */
function userFacingMessage(code: EmailProviderErrorCode): string {
  switch (code) {
    case 'TIMEOUT':
      return 'The mail server did not respond in time. Check the host and port, then try again.';
    case 'AUTH_FAILED':
      return 'Authentication failed. Check the username, and use an app password if the provider requires one.';
    case 'TLS_FAILED':
      return 'The secure connection to the mail server failed. Check the host name and the TLS setting.';
    case 'CONNECTION_FAILED':
      return 'Could not reach the mail server. Check the host, port, and your network connection.';
    case 'MAILBOX_NOT_FOUND':
      return 'The requested folder does not exist on this mailbox.';
    case 'NOT_CONNECTED':
      return 'The provider is not connected.';
    case 'ALREADY_CONNECTED':
      return 'The provider is already connected.';
    case 'CONFIG_INVALID':
      return 'The account configuration is incomplete or invalid.';
    case 'DISCONNECT_FAILED':
      return 'The connection could not be closed cleanly.';
    case 'PROTOCOL_ERROR':
      return 'The mail server returned an unexpected response.';
    default:
      return 'The mail provider returned an unexpected error.';
  }
}

/** User-facing messages for OAuth and API errors. */
export function oauthUserFacingMessage(code: string): string {
  switch (code) {
    case 'OAUTH_FAILED':
      return 'Gmail authorization failed. Re-connect your account to continue.';
    case 'OAUTH_STATE_MISMATCH':
      return 'Invalid authorization state. Please try connecting again.';
    case 'TOKEN_REFRESH_FAILED':
      return 'Failed to refresh Gmail tokens. Re-connect your account.';
    case 'RATE_LIMITED':
      return 'Gmail API rate limit reached. Please wait a moment and try again.';
    case 'ACCOUNT_REVOKED':
      return 'Gmail access has been revoked. Re-authorize to continue.';
    default:
      return 'An unexpected authentication error occurred.';
  }
}
