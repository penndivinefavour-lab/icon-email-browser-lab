/**
 * Email Provider Abstraction Layer
 *
 * Supports multiple email providers through adapters.
 * First implementation includes a MockProvider for local testing.
 */

export interface EmailProviderConfig {
  type: 'mock' | 'imap' | 'gmail' | 'outlook';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  delay?: number; // Simulated delay for mock
}

export interface EmailMessage {
  id: string;
  messageIdExternal?: string;
  subject: string;
  sender: string;
  recipient: string;
  body: string;
  bodyHtml?: string;
  receivedAt: Date;
  isRead: boolean;
  attachments: EmailAttachment[];
  rawHeaders?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content?: string;
}

export interface EmailAccountConnection {
  accountId: string;
  identityId: string;
  providerType: string;
  config: EmailProviderConfig;
  isActive: boolean;
}

export abstract class EmailProvider {
  protected config: EmailProviderConfig;
  protected accountId: string;
  protected identityId: string;

  constructor(config: EmailProviderConfig, accountId: string, identityId: string) {
    this.config = config;
    this.accountId = accountId;
    this.identityId = identityId;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]>;
  abstract searchMessages(query: string): Promise<EmailMessage[]>;
  abstract markAsRead(messageId: string): Promise<boolean>;
  abstract getUnreadCount(): Promise<number>;

  getConfig(): EmailProviderConfig {
    return this.config;
  }
}

export class MockEmailProvider extends EmailProvider {
  private messages: EmailMessage[] = [];
  private messageCounter = 0;

  constructor(config: EmailProviderConfig, accountId: string, identityId: string) {
    super(config, accountId, identityId);
    // Pre-populate with some demo messages if delay is set
    if (config.delay && config.delay > 0) {
      this.generateDemoMessages();
    }
  }

  private generateDemoMessages(): void {
    const demoMessages: Omit<EmailMessage, 'id'>[] = [
      {
        messageIdExternal: 'demo-001',
        subject: 'Your verification code for ICON Lab',
        sender: 'noreply@example.test',
        recipient: 'demo@example.test',
        body: 'Your verification code is: 847291. This code expires in 10 minutes.',
        bodyHtml: '<p>Your verification code is: <strong>847291</strong>. This code expires in 10 minutes.</p>',
        receivedAt: new Date(Date.now() - 1000 * 60 * 2),
        isRead: false,
        attachments: [],
      },
      {
        messageIdExternal: 'demo-002',
        subject: 'Welcome to ICON Email Browser Lab',
        sender: 'hello@icon-studios.test',
        recipient: 'demo@example.test',
        body: 'Welcome! Your account has been created successfully. Start by setting up your profile.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 30),
        isRead: true,
        attachments: [],
      },
      {
        messageIdExternal: 'demo-003',
        subject: 'OTP: Login Verification',
        sender: 'auth@app.test',
        recipient: 'demo@example.test',
        body: 'Login code: 392847. Do not share this code with anyone.',
        bodyHtml: '<p>Login code: <strong>392847</strong>. Do not share this code with anyone.</p>',
        receivedAt: new Date(Date.now() - 1000 * 60 * 5),
        isRead: false,
        attachments: [],
      },
    ];

    for (const msg of demoMessages) {
      this.messages.push({
        ...msg,
        id: `mock-${++this.messageCounter}`,
      });
    }
  }

  async connect(): Promise<boolean> {
    // Simulate connection delay
    const delay = this.config.delay || 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.messages = [];
  }

  async fetchMessages(limit = 50, offset = 0): Promise<EmailMessage[]> {
    const sorted = [...this.messages].sort((a, b) =>
      b.receivedAt.getTime() - a.receivedAt.getTime()
    );
    return sorted.slice(offset, offset + limit);
  }

  async searchMessages(query: string): Promise<EmailMessage[]> {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(lowerQuery) ||
        m.sender.toLowerCase().includes(lowerQuery) ||
        m.body.toLowerCase().includes(lowerQuery)
    );
  }

  async markAsRead(messageId: string): Promise<boolean> {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.isRead = true;
      return true;
    }
    return false;
  }

  async getUnreadCount(): Promise<number> {
    return this.messages.filter((m) => !m.isRead).length;
  }

  // Helper for adding test messages
  addMessage(message: Omit<EmailMessage, 'id'>): EmailMessage {
    const id = `mock-${++this.messageCounter}`;
    const msg: EmailMessage = {
      ...message,
      id,
    };
    this.messages.push(msg);
    return msg;
  }

  clearMessages(): void {
    this.messages = [];
    this.messageCounter = 0;
  }
}

export class IMAPProvider extends EmailProvider {
  async connect(): Promise<boolean> {
    // TODO: Implement IMAP connection using a library like imapflow or node-imap
    // Requires: host, port, user, password from config
    console.warn('IMAPProvider not yet implemented');
    return false;
  }

  async disconnect(): Promise<void> {
    // TODO
  }

  async fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]> {
    console.warn('IMAPProvider.fetchMessages not yet implemented');
    return [];
  }

  async searchMessages(query: string): Promise<EmailMessage[]> {
    console.warn('IMAPProvider.searchMessages not yet implemented');
    return [];
  }

  async markAsRead(messageId: string): Promise<boolean> {
    console.warn('IMAPProvider.markAsRead not yet implemented');
    return false;
  }

  async getUnreadCount(): Promise<number> {
    console.warn('IMAPProvider.getUnreadCount not yet implemented');
    return 0;
  }
}

export class GmailProvider extends EmailProvider {
  async connect(): Promise<boolean> {
    // TODO: Implement Gmail API connection using OAuth2
    // Requires: clientId, clientSecret
    console.warn('GmailProvider not yet implemented');
    return false;
  }

  async disconnect(): Promise<void> {
    // TODO
  }

  async fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]> {
    console.warn('GmailProvider.fetchMessages not yet implemented');
    return [];
  }

  async searchMessages(query: string): Promise<EmailMessage[]> {
    console.warn('GmailProvider.searchMessages not yet implemented');
    return [];
  }

  async markAsRead(messageId: string): Promise<boolean> {
    console.warn('GmailProvider.markAsRead not yet implemented');
    return false;
  }

  async getUnreadCount(): Promise<number> {
    console.warn('GmailProvider.getUnreadCount not yet implemented');
    return 0;
  }
}

export class OutlookProvider extends EmailProvider {
  async connect(): Promise<boolean> {
    // TODO: Implement Microsoft Graph API connection
    console.warn('OutlookProvider not yet implemented');
    return false;
  }

  async disconnect(): Promise<void> {
    // TODO
  }

  async fetchMessages(limit?: number, offset?: number): Promise<EmailMessage[]> {
    console.warn('OutlookProvider.fetchMessages not yet implemented');
    return [];
  }

  async searchMessages(query: string): Promise<EmailMessage[]> {
    console.warn('OutlookProvider.searchMessages not yet implemented');
    return [];
  }

  async markAsRead(messageId: string): Promise<boolean> {
    console.warn('OutlookProvider.markAsRead not yet implemented');
    return false;
  }

  async getUnreadCount(): Promise<number> {
    console.warn('OutlookProvider.getUnreadCount not yet implemented');
    return 0;
  }
}

export function createProvider(config: EmailProviderConfig, accountId: string, identityId: string): EmailProvider {
  switch (config.type) {
    case 'mock':
      return new MockEmailProvider(config, accountId, identityId);
    case 'imap':
      return new IMAPProvider(config, accountId, identityId);
    case 'gmail':
      return new GmailProvider(config, accountId, identityId);
    case 'outlook':
      return new OutlookProvider(config, accountId, identityId);
    default:
      throw new Error(`Unknown provider type: ${(config.type as string)}`);
  }
}
