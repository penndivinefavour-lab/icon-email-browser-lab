/**
 * OTP / Verification Code Parser
 *
 * Detects OTP codes, verification codes, and confirmation links
 * from email messages. Configurable patterns.
 */

export interface OTPRecord {
  id: string;
  messageId: string;
  identityId: string;
  sender: string;
  serviceLabel?: string;
  code: string;
  codeType: 'otp' | 'verification' | 'token' | 'pin';
  receivedAt: Date;
  expiresAt?: Date;
  status: 'detected' | 'used' | 'expired' | 'invalid' | 'pending';
  notes?: string;
}

export interface OTPConfig {
  // Patterns for detecting OTP codes
  patterns: RegExp[];
  // Patterns for detecting verification links
  linkPatterns?: RegExp[];
  // Maximum code length
  maxCodeLength?: number;
  // Minimum code length
  minCodeLength?: number;
  // Code separators to split on
  separators?: string[];
  // Service label detection patterns
  servicePatterns?: RegExp[];
  // Expiration detection patterns
  expiryPatterns?: RegExp[];
}

export const defaultOTPConfig: OTPConfig = {
  patterns: [
    // 6-digit OTP: 123456
    /\b(\d{6})\b/g,
    // 6-digit with spaces: 123 456
    /\b(\d{3}\s\d{3})\b/g,
    // 6-digit with dashes: 123-456
    /\b(\d{3}-\d{3})\b/g,
    // 8-digit OTP: 12345678
    /\b(\d{8})\b/g,
    // 5-digit OTP: 12345
    /\b(\d{5})\b/g,
    // Generic numeric code in context: "code is: 123456"
    /code[is:]*\s*(\d+)/i,
    /verification code[:\s]*(\d+)/i,
    /otp[:\s]*(\d+)/i,
    /your code[:\s]*(\d+)/i,
    /confirmation code[:\s]*(\d+)/i,
  ],
  linkPatterns: [
    /\b(https?:\/\/[^\s]+\/verify[^\s]*)/gi,
    /\b(https?:\/\/[^\s]+\/confirm[^\s]*)/gi,
    /\b(https?:\/\/[^\s]+\/activate[^\s]*)/gi,
    /\b(https?:\/\/[^\s]+\/auth[^\s]*)/gi,
    /\b(https?:\/\/[^\s]+\/login[^\s]*)/gi,
  ],
  maxCodeLength: 12,
  minCodeLength: 4,
  separators: [' ', '-', '_', ':'],
  servicePatterns: [
    /for\s+([A-Za-z][A-Za-z\s]+?)(?:\s+[Ss]ervice)?/i,
    /from\s+([A-Za-z][A-Za-z\s]+?)(?:\s+[Cc]ode)?/i,
    /verification\s+for\s+([A-Za-z][A-Za-z\s]+?)/i,
    /code\s+for\s+([A-Za-z][A-Za-z\s]+?)/i,
  ],
  expiryPatterns: [
    /expires?\s+in\s+(\d+)\s*(minute|min|hour|hr|second|sec)/i,
    /valid\s+for\s+(\d+)\s*(minute|min|hour|hr|second|sec)/i,
    /expires?\s+at\s+([A-Za-z]+\s+\d+\s+[A-Za-z]+\s+\d{4})/i,
    /expires?\s+:\s*(\d{1,2}:\d{2})/i,
  ],
};

export class OTPParser {
  private config: OTPConfig;

  constructor(config: Partial<OTPConfig> = {}) {
    this.config = { ...defaultOTPConfig, ...config };
  }

  parseMessage(message: {
    subject: string;
    body: string;
    sender: string;
    receivedAt: Date;
  }): OTPRecord[] {
    const results: OTPRecord[] = [];
    const fullText = `${message.subject}\n\n${message.body}`;

    // Extract codes using patterns
    const codes: Set<string> = new Set();

    for (const pattern of this.config.patterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        let code = match[1];

        // Clean up the code
        if (code.includes(' ')) {
          code = code.replace(/\s/g, '');
        }
        if (code.includes('-')) {
          code = code.replace(/-/g, '');
        }

        // Validate code length
        if (code.length < (this.config.minCodeLength || 4)) continue;
        if (code.length > (this.config.maxCodeLength || 12)) continue;

        // Must be numeric
        if (!/^\d+$/.test(code)) continue;

        codes.add(code);
      }
    }

    // Extract service labels
    let serviceLabel: string | undefined;
    for (const pattern of this.config.servicePatterns || []) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        serviceLabel = match[1].trim();
        break;
      }
    }

    // Extract expiration if present
    let expiresAt: Date | undefined;
    for (const pattern of this.config.expiryPatterns || []) {
      const match = fullText.match(pattern);
      if (match) {
        expiresAt = this.parseExpiry(match[0]);
        if (expiresAt) break;
      }
    }

    // Create records for each unique code found
    for (const code of codes) {
      results.push({
        id: this.generateId(),
        messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        identityId: '',
        sender: message.sender,
        serviceLabel,
        code,
        codeType: this.detectCodeType(code, message),
        receivedAt: message.receivedAt,
        expiresAt,
        status: 'detected',
      });
    }

    return results;
  }

  private detectCodeType(code: string, message: { subject: string; body: string }): 'otp' | 'verification' | 'token' | 'pin' {
    const fullText = message.subject + message.body;

    if (/pin|passcode|personal\s*identification/i.test(fullText)) {
      return 'pin';
    }
    if (/token|api|bearer|jwt/i.test(fullText)) {
      return 'token';
    }
    if (/verification|confirm|activate|register/i.test(fullText)) {
      return 'verification';
    }

    return 'otp';
  }

  private parseExpiry(text: string): Date | undefined {
    const minuteMatch = text.match(/(\d+)\s*(minute|min)/i);
    if (minuteMatch) {
      const minutes = parseInt(minuteMatch[1]);
      return new Date(Date.now() + minutes * 60 * 1000);
    }

    const hourMatch = text.match(/(\d+)\s*(hour|hr)/i);
    if (hourMatch) {
      const hours = parseInt(hourMatch[1]);
      return new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const timeMatch = text.match(/(\d{1,2}):(\d{2})/i);
    if (timeMatch) {
      const [_, hour, min] = timeMatch;
      const now = new Date();
      const expiry = new Date(now);
      expiry.setHours(parseInt(hour));
      expiry.setMinutes(parseInt(min));
      if (expiry.getTime() <= now.getTime()) {
        expiry.setDate(expiry.getDate() + 1);
      }
      return expiry;
    }

    // Try to parse absolute date
    const absoluteMatch = text.match(/(\w+\s+\d+\s+\w+\s+\d{4})/i);
    if (absoluteMatch) {
      const parsed = new Date(absoluteMatch[1]);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return undefined;
  }

  private generateId(): string {
    return `vc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check if a code has expired
  isExpired(record: OTPRecord): boolean {
    if (!record.expiresAt) return false;
    return new Date(record.expiresAt) < new Date();
  }

  // Validate a code format
  isValidCode(code: string): boolean {
    if (code.length < (this.config.minCodeLength || 4)) return false;
    if (code.length > (this.config.maxCodeLength || 12)) return false;
    return /^\d+$/.test(code);
  }
}

// Singleton instance
let parserInstance: OTPParser | null = null;

export function getOTPParser(config?: Partial<OTPConfig>): OTPParser {
  if (!parserInstance) {
    parserInstance = new OTPParser(config);
  } else if (config) {
    parserInstance = new OTPParser(config);
  }
  return parserInstance;
}
