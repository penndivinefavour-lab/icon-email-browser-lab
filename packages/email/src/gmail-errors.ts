/**
 * Errors specific to the Gmail OAuth and API integration.
 * Extends EmailProviderErrorCode with Gmail-specific codes.
 */

import { EmailProviderError, type EmailProviderErrorCode } from './errors.js';

export type GmailErrorCode =
  | EmailProviderErrorCode
  | 'OAUTH_FAILED'
  | 'OAUTH_STATE_MISMATCH'
  | 'OAUTH_CODE_EXPIRED'
  | 'TOKEN_REFRESH_FAILED'
  | 'SCOPE_MISMATCH'
  | 'RATE_LIMITED'
  | 'ACCOUNT_REVOKED';

export function gmailError(code: GmailErrorCode, message: string, opts?: { detail?: string; cause?: unknown }): EmailProviderError {
  return new EmailProviderError({ code, message, detail: opts?.detail, cause: opts?.cause } as any);
}

export function isGmailOAuthError(err: unknown): err is EmailProviderError {
  if (!(err instanceof EmailProviderError)) return false;
  const code = (err as { code?: string }).code;
  return typeof code === 'string' && (
    code.startsWith('OAUTH_') ||
    code === 'RATE_LIMITED' ||
    code === 'ACCOUNT_REVOKED'
  );
}
