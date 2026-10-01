/**
 * Placeholder for Microsoft Graph provider. Phase 6c.
 */

import { EmailProvider, type ConnectionTestResult, type EmailMessage, type MailboxInfo } from './types.js';

export class OutlookProvider extends EmailProvider {
  private unavailable(): never {
    throw new Error(
      'The Outlook provider is not implemented yet. It arrives in Phase 6c; use the IMAP provider or the mock provider for now.'
    );
  }
  async connect(): Promise<boolean> {
    return this.unavailable();
  }
  async disconnect(): Promise<void> {
    return this.unavailable();
  }
  async fetchMessages(): Promise<EmailMessage[]> {
    return this.unavailable();
  }
  async searchMessages(): Promise<EmailMessage[]> {
    return this.unavailable();
  }
  async markAsRead(): Promise<boolean> {
    return this.unavailable();
  }
  async getUnreadCount(): Promise<number> {
    return this.unavailable();
  }
}
