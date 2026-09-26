/***
 * Shared package exports
 *
 * Re-exports types and utilities from all packages for convenient cross-package usage.
 */

export { getDatabase, Database } from '@database/index';
export type {
  Identity,
  EmailAccount,
  Message,
  VerificationCode,
  BrowserProfile,
  Session,
  TestRun,
  TestArtifact,
  ActivityLog,
  Setting,
} from '@database/index';

// ─── Session create input type ───
export interface SessionInput {
  profile_id: string;
  identity_id: string | null;
  started_at?: string;
  ended_at?: string | null;
  duration_ms?: number | null;
  status?: string;
  test_run_id?: string | null;
  notes?: string | null;
}

// ─── UI-only types (not in database schema) ───
export interface MessageDetail {
  id: string;
  account_id: string;
  identity_id: string | null;
  subject: string;
  sender: string;
  recipient: string;
  body: string;
  received_at: string;
  is_read: number;
  attachments: string;
}

export interface VerificationCodeDisplay {
  id: string;
  identity_id: string;
  identity_email: string;
  code: string;
  code_type: string;
  sender: string;
  service_label: string;
  received_at: string;
  expires_at: string | null;
  status: string;
  notes: string | null;
  message_subject: string;
  message_body: string;
}
