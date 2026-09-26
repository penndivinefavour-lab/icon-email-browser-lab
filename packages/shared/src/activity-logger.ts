/**
 * Activity Logger
 *
 * Records all significant actions for audit trail.
 */

import type { ActivityLog } from '@database/index';

export type ActionResult = 'success' | 'error' | 'warning' | 'info';

export interface ActivityEntry {
  action: string;
  entity: string;
  entityId: string;
  actor: string;
  result: ActionResult;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

export class ActivityLogger {
  private logs: ActivityEntry[] = [];
  private maxLogs: number;

  constructor(maxLogs = 10000) {
    this.maxLogs = maxLogs;
  }

  log(entry: ActivityEntry): void {
    const record: ActivityEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date(),
    };

    this.logs.push(record);

    // Trim if over max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  logIdentityCreated(id: string, email: string, actor = 'system'): void {
    this.log({
      action: 'identity_created',
      entity: 'identity',
      entityId: id,
      actor,
      result: 'success',
      details: { email },
    });
  }

  logIdentityUpdated(id: string, changes: string[], actor = 'system'): void {
    this.log({
      action: 'identity_updated',
      entity: 'identity',
      entityId: id,
      actor,
      result: 'success',
      details: { changes },
    });
  }

  logIdentityDeleted(id: string, email: string, actor = 'system'): void {
    this.log({
      action: 'identity_deleted',
      entity: 'identity',
      entityId: id,
      actor,
      result: 'success',
      details: { email },
    });
  }

  logIdentityImported(count: number, source: string, actor = 'system'): void {
    this.log({
      action: 'identity_imported',
      entity: 'identity',
      entityId: 'bulk',
      actor,
      result: 'success',
      details: { count, source },
    });
  }

  logIdentityAssigned(id: string, profileId: string, actor = 'system'): void {
    this.log({
      action: 'identity_assigned',
      entity: 'identity',
      entityId: id,
      actor,
      result: 'success',
      details: { profileId },
    });
  }

  logIdentityMarkedUsed(id: string, actor = 'system'): void {
    this.log({
      action: 'identity_marked_used',
      entity: 'identity',
      entityId: id,
      actor,
      result: 'success',
    });
  }

  logIdentityMarkedAvailable(id: string, actor = 'system'): void {
    this.log({
      action: 'identity_marked_available',
      entity: 'identity',
      entityId: id,
      actor,
      result: 'success',
    });
  }

  logMessageReceived(id: string, subject: string, identityId: string, actor = 'system'): void {
    this.log({
      action: 'message_received',
      entity: 'message',
      entityId: id,
      actor,
      result: 'success',
      details: { subject, identityId },
    });
  }

  logOTPDetected(id: string, code: string, service: string, identityId: string, actor = 'system'): void {
    this.log({
      action: 'otp_detected',
      entity: 'verification_code',
      entityId: id,
      actor,
      result: 'success',
      details: { code, service, identityId },
    });
  }

  logOTPUsed(id: string, actor = 'system'): void {
    this.log({
      action: 'otp_used',
      entity: 'verification_code',
      entityId: id,
      actor,
      result: 'success',
    });
  }

  logOTPExpired(id: string, actor = 'system'): void {
    this.log({
      action: 'otp_expired',
      entity: 'verification_code',
      entityId: id,
      actor,
      result: 'info',
    });
  }

  logProfileCreated(id: string, name: string, actor = 'system'): void {
    this.log({
      action: 'profile_created',
      entity: 'browser_profile',
      entityId: id,
      actor,
      result: 'success',
      details: { name },
    });
  }

  logProfileLaunched(id: string, actor = 'system'): void {
    this.log({
      action: 'profile_launched',
      entity: 'browser_profile',
      entityId: id,
      actor,
      result: 'success',
    });
  }

  logProfileStopped(id: string, actor = 'system'): void {
    this.log({
      action: 'profile_stopped',
      entity: 'browser_profile',
      entityId: id,
      actor,
      result: 'success',
    });
  }

  logProfileDeleted(id: string, name: string, actor = 'system'): void {
    this.log({
      action: 'profile_deleted',
      entity: 'browser_profile',
      entityId: id,
      actor,
      result: 'success',
      details: { name },
    });
  }

  logSessionStarted(id: string, profileId: string, identityId?: string, actor = 'system'): void {
    this.log({
      action: 'session_started',
      entity: 'session',
      entityId: id,
      actor,
      result: 'success',
      details: { profileId, identityId },
    });
  }

  logSessionEnded(id: string, durationMs: number, actor = 'system'): void {
    this.log({
      action: 'session_ended',
      entity: 'session',
      entityId: id,
      actor,
      result: 'success',
      details: { durationMs },
    });
  }

  logTestStarted(id: string, name: string, profileId?: string, actor = 'system'): void {
    this.log({
      action: 'test_started',
      entity: 'test_run',
      entityId: id,
      actor,
      result: 'success',
      details: { name, profileId },
    });
  }

  logTestPassed(id: string, durationMs: number, actor = 'system'): void {
    this.log({
      action: 'test_passed',
      entity: 'test_run',
      entityId: id,
      actor,
      result: 'success',
      details: { durationMs },
    });
  }

  logTestFailed(id: string, error?: string, actor = 'system'): void {
    this.log({
      action: 'test_failed',
      entity: 'test_run',
      entityId: id,
      actor,
      result: 'error',
      details: { error },
    });
  }

  logTestCancelled(id: string, actor = 'system'): void {
    this.log({
      action: 'test_cancelled',
      entity: 'test_run',
      entityId: id,
      actor,
      result: 'info',
    });
  }

  getRecent(limit = 50): ActivityEntry[] {
    return this.logs.slice(-limit);
  }

  getByAction(action: string): ActivityEntry[] {
    return this.logs.filter((l) => l.action === action);
  }

  getByEntity(entity: string): ActivityEntry[] {
    return this.logs.filter((l) => l.entity === entity);
  }

  getByResult(result: ActionResult): ActivityEntry[] {
    return this.logs.filter((l) => l.result === result);
  }

  getByDateRange(start: Date, end: Date): ActivityEntry[] {
    return this.logs.filter((l) => {
      const t = new Date(l.timestamp!);
      return t >= start && t <= end;
    });
  }

  clear(): void {
    this.logs = [];
  }

  getCount(): number {
    return this.logs.length;
  }
}

// Singleton
let loggerInstance: ActivityLogger | null = null;

export function getActivityLogger(): ActivityLogger {
  if (!loggerInstance) {
    loggerInstance = new ActivityLogger();
  }
  return loggerInstance;
}
