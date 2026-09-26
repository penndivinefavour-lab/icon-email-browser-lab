/**
 * Database abstraction layer for ICON Email & Browser Lab.
 * Uses sql.js (WebAssembly SQLite) for local-first operation.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to sql.js WASM file
const SQLJS_WASM_PATH = path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

// Type definitions for our schema
export interface Identity {
  id: string;
  email: string;
  display_name: string | null;
  provider: string;
  status: string;
  tags: string;
  notes: string | null;
  created_at: string;
  last_used_at: string | null;
  browser_profile_id: string | null;
  verification_status: string;
  source: string;
  metadata: string;
}

export interface EmailAccount {
  id: string;
  identity_id: string;
  provider_type: string;
  config: string;
  is_active: number;
  created_at: string;
  last_synced_at: string | null;
}

export interface Message {
  id: string;
  account_id: string;
  message_id_external: string | null;
  subject: string;
  sender: string;
  recipient: string;
  body: string | null;
  body_html: string | null;
  received_at: string;
  is_read: number;
  attachments: string;
  raw_headers: string | null;
}

export interface VerificationCode {
  id: string;
  message_id: string;
  identity_id: string;
  sender: string;
  service_label: string | null;
  code: string;
  code_type: string;
  received_at: string;
  expires_at: string | null;
  status: string;
  notes: string | null;
}

export interface BrowserProfile {
  id: string;
  name: string;
  browser: string;
  directory: string;
  identity_id: string | null;
  status: string;
  created_at: string;
  last_launched_at: string | null;
  last_closed_at: string | null;
  notes: string | null;
}

// Session type (used by createSession / SessionInput)
export interface Session {
  id: string;
  profile_id: string;
  identity_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: string;
  test_run_id: string | null;
  notes: string | null;
}

/** Input type for creating a session. `started_at` has a default. */
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

/** Row-to-session helper: converts a raw DB row value tuple into a Session. */
function rowToSession(row: (string | number | null)[]): Session {
  return {
    id: row[0] as string,
    profile_id: row[1] as string,
    identity_id: row[2] as string | null,
    started_at: row[3] as string,
    ended_at: row[4] as string | null,
    duration_ms: row[5] as number | null,
    status: row[6] as string,
    test_run_id: row[7] as string | null,
    notes: row[8] as string | null,
  };
}

export interface TestRun {
  id: string;
  name: string;
  target_environment: string;
  profile_id: string | null;
  identity_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  logs: string;
  screenshots: string;
  result: string | null;
}

export interface TestArtifact {
  id: string;
  test_run_id: string;
  artifact_type: string;
  file_path: string;
  description: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  action: string;
  entity: string;
  entity_id: string;
  actor: string;
  result: string;
  details: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export class Database {
  private db: SqlJsDatabase | null = null;
  private path: string;
  private initialized = false;

  constructor(dbPath?: string) {
    this.path = dbPath || path.join(process.cwd(), 'data', 'icon-lab.db');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load sql.js with WASM binary
    const wasmBinary = fs.readFileSync(SQLJS_WASM_PATH);
    const wasmArrayBuffer = wasmBinary instanceof ArrayBuffer
      ? wasmBinary
      : (wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength)
          ?? wasmBinary.buffer);
    const SQL = await initSqlJs({ wasmBinary: wasmArrayBuffer });

    if (fs.existsSync(this.path)) {
      const fileBuffer = fs.readFileSync(this.path);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.runMigrations();
    this.initialized = true;
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const migrations: { name: string; sql: string }[] = [
      {
        name: '001_identities',
        sql: `
          CREATE TABLE IF NOT EXISTS identities (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            provider TEXT NOT NULL DEFAULT 'unknown',
            status TEXT NOT NULL DEFAULT 'available',
            tags TEXT NOT NULL DEFAULT '[]',
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_used_at TEXT,
            browser_profile_id TEXT,
            verification_status TEXT NOT NULL DEFAULT 'unverified',
            source TEXT NOT NULL DEFAULT 'manual',
            metadata TEXT NOT NULL DEFAULT '{}'
          );
          CREATE INDEX IF NOT EXISTS idx_identities_email ON identities(email);
          CREATE INDEX IF NOT EXISTS idx_identities_status ON identities(status);
          CREATE INDEX IF NOT EXISTS idx_identities_provider ON identities(provider);
        `,
      },
      {
        name: '002_email_accounts',
        sql: `
          CREATE TABLE IF NOT EXISTS email_accounts (
            id TEXT PRIMARY KEY,
            identity_id TEXT NOT NULL UNIQUE,
            provider_type TEXT NOT NULL,
            config TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_synced_at TEXT,
            FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_email_accounts_identity ON email_accounts(identity_id);
        `,
      },
      {
        name: '003_messages',
        sql: `
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            message_id_external TEXT,
            subject TEXT NOT NULL DEFAULT '',
            sender TEXT NOT NULL DEFAULT '',
            recipient TEXT NOT NULL DEFAULT '',
            body TEXT,
            body_html TEXT,
            received_at TEXT NOT NULL DEFAULT (datetime('now')),
            is_read INTEGER NOT NULL DEFAULT 0,
            attachments TEXT NOT NULL DEFAULT '[]',
            raw_headers TEXT,
            FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id);
          CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at);
          CREATE INDEX IF NOT EXISTS idx_messages_subject ON messages(subject);
          CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
        `,
      },
      {
        name: '004_verification_codes',
        sql: `
          CREATE TABLE IF NOT EXISTS verification_codes (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL UNIQUE,
            identity_id TEXT NOT NULL,
            sender TEXT NOT NULL DEFAULT '',
            service_label TEXT,
            code TEXT NOT NULL,
            code_type TEXT NOT NULL DEFAULT 'otp',
            received_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT,
            status TEXT NOT NULL DEFAULT 'detected',
            notes TEXT,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_verification_codes_identity ON verification_codes(identity_id);
          CREATE INDEX IF NOT EXISTS idx_verification_codes_status ON verification_codes(status);
          CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
        `,
      },
      {
        name: '005_browser_profiles',
        sql: `
          CREATE TABLE IF NOT EXISTS browser_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            browser TEXT NOT NULL DEFAULT 'chromium',
            directory TEXT NOT NULL,
            identity_id TEXT,
            status TEXT NOT NULL DEFAULT 'inactive',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_launched_at TEXT,
            last_closed_at TEXT,
            notes TEXT,
            FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS idx_browser_profiles_identity ON browser_profiles(identity_id);
          CREATE INDEX IF NOT EXISTS idx_browser_profiles_status ON browser_profiles(status);
        `,
      },
      {
        name: '006_sessions',
        sql: `
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            identity_id TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            ended_at TEXT,
            duration_ms INTEGER,
            status TEXT NOT NULL DEFAULT 'active',
            test_run_id TEXT,
            notes TEXT,
            FOREIGN KEY (profile_id) REFERENCES browser_profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL,
            FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
          CREATE INDEX IF NOT EXISTS idx_sessions_test_run ON sessions(test_run_id);
        `,
      },
      {
        name: '007_test_runs',
        sql: `
          CREATE TABLE IF NOT EXISTS test_runs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            target_environment TEXT NOT NULL DEFAULT 'local',
            profile_id TEXT,
            identity_id TEXT,
            started_at TEXT,
            ended_at TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            logs TEXT NOT NULL DEFAULT '[]',
            screenshots TEXT NOT NULL DEFAULT '[]',
            result TEXT,
            FOREIGN KEY (profile_id) REFERENCES browser_profiles(id) ON DELETE SET NULL,
            FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
          CREATE INDEX IF NOT EXISTS idx_test_runs_profile ON test_runs(profile_id);
        `,
      },
      {
        name: '008_test_artifacts',
        sql: `
          CREATE TABLE IF NOT EXISTS test_artifacts (
            id TEXT PRIMARY KEY,
            test_run_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_test_artifacts_test_run ON test_artifacts(test_run_id);
        `,
      },
      {
        name: '009_activity_logs',
        sql: `
          CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT 'system',
            result TEXT NOT NULL DEFAULT 'success',
            details TEXT NOT NULL DEFAULT '{}'
          );
          CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
          CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
          CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity);
          CREATE INDEX IF NOT EXISTS idx_activity_logs_result ON activity_logs(result);
        `,
      },
      {
        name: '010_settings',
        sql: `
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `,
      },
    ];

    for (const migration of migrations) {
      const existing = this.db.exec(`SELECT id FROM _migrations WHERE name = '${migration.name}'`);
      if (existing.length > 0) continue;

      this.db.run(migration.sql);
      this.db.run(`INSERT INTO _migrations (name) VALUES ('${migration.name}')`);
    }
  }

  save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.path, buffer);
  }

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  // ─── Identity operations ───

  createIdentity(data: Omit<Identity, 'id' | 'created_at'>): Identity {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO identities (id, email, display_name, provider, status, tags, notes, last_used_at, browser_profile_id, verification_status, source, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.email,
        data.display_name,
        data.provider,
        data.status,
        data.tags,
        data.notes,
        data.last_used_at,
        data.browser_profile_id,
        data.verification_status,
        data.source,
        data.metadata,
      ]
    );
    this.save();
    return this.getIdentityById(id)!;
  }

  getIdentityById(id: string): Identity | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM identities WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToIdentity(result[0].values[0]);
  }

  getAllIdentities(): Identity[] {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM identities ORDER BY created_at DESC`);
    return result[0]?.values.map((v) => this.rowToIdentity(v)) || [];
  }

  updateIdentity(id: string, data: Partial<Omit<Identity, 'id' | 'created_at'>>): Identity | null {
    this.ensureInitialized();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (data.display_name !== undefined) { fields.push('display_name = ?'); values.push(data.display_name); }
    if (data.provider !== undefined) { fields.push('provider = ?'); values.push(data.provider); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.tags !== undefined) { fields.push('tags = ?'); values.push(data.tags); }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
    if (data.last_used_at !== undefined) { fields.push('last_used_at = ?'); values.push(data.last_used_at); }
    if (data.browser_profile_id !== undefined) { fields.push('browser_profile_id = ?'); values.push(data.browser_profile_id); }
    if (data.verification_status !== undefined) { fields.push('verification_status = ?'); values.push(data.verification_status); }
    if (data.source !== undefined) { fields.push('source = ?'); values.push(data.source); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); values.push(data.metadata); }

    if (fields.length === 0) return this.getIdentityById(id);

    values.push(id);
    this.db!.run(`UPDATE identities SET ${fields.join(', ')} WHERE id = ?`, values);
    this.save();
    return this.getIdentityById(id);
  }

  deleteIdentity(id: string): boolean {
    this.ensureInitialized();
    this.db!.run(`DELETE FROM identities WHERE id = ?`, [id]);
    this.save();
    // Verify deletion by checking if row still exists
    const check = this.db!.exec(`SELECT id FROM identities WHERE id = ?`, [id]);
    return check.length === 0 || check[0].values.length === 0;
  }

  searchIdentities(query: string): Identity[] {
    this.ensureInitialized();
    const searchTerm = `%${query}%`;
    const result = this.db!.exec(
      `SELECT * FROM identities WHERE email LIKE ? OR display_name LIKE ? OR notes LIKE ? ORDER BY created_at DESC`,
      [searchTerm, searchTerm, searchTerm]
    );
    return result[0]?.values.map((v) => this.rowToIdentity(v)) || [];
  }

  filterIdentities(filters: {
    status?: string;
    provider?: string;
    tags?: string;
    search?: string;
  }): Identity[] {
    this.ensureInitialized();
    let sql = 'SELECT * FROM identities WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.provider) {
      sql += ' AND provider = ?';
      params.push(filters.provider);
    }
    if (filters.tags) {
      sql += ' AND tags LIKE ?';
      params.push(`%${filters.tags}%`);
    }
    if (filters.search) {
      const s = `%${filters.search}%`;
      sql += ' AND (email LIKE ? OR display_name LIKE ? OR notes LIKE ?)';
      params.push(s, s, s);
    }

    sql += ' ORDER BY created_at DESC';

    const result = this.db!.exec(sql, params);
    return result[0]?.values.map((v) => this.rowToIdentity(v)) || [];
  }

  // ─── Email account operations ───

  createEmailAccount(data: Omit<EmailAccount, 'id' | 'created_at'>): EmailAccount {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO email_accounts (id, identity_id, provider_type, config, is_active, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.identity_id, data.provider_type, data.config, data.is_active, data.last_synced_at]
    );
    this.save();
    return this.getEmailAccountById(id)!;
  }

  getEmailAccountById(id: string): EmailAccount | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM email_accounts WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToEmailAccount(result[0].values[0]);
  }

  getEmailAccountByIdentityId(identityId: string): EmailAccount | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM email_accounts WHERE identity_id = ?`, [identityId]);
    if (result.length === 0) return null;
    return this.rowToEmailAccount(result[0].values[0]);
  }

  // ─── Message operations ───

  createMessage(data: Omit<Message, 'id'>): Message {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO messages (id, account_id, message_id_external, subject, sender, recipient, body, body_html, received_at, is_read, attachments, raw_headers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.account_id,
        data.message_id_external,
        data.subject,
        data.sender,
        data.recipient,
        data.body,
        data.body_html,
        data.received_at,
        data.is_read,
        data.attachments,
        data.raw_headers,
      ]
    );
    this.save();
    return this.getMessageById(id)!;
  }

  getMessageById(id: string): Message | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM messages WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToMessage(result[0].values[0]);
  }

  getMessagesByAccount(accountId: string, limit = 50, offset = 0): Message[] {
    this.ensureInitialized();
    const result = this.db!.exec(
      `SELECT * FROM messages WHERE account_id = ? ORDER BY received_at DESC LIMIT ? OFFSET ?`,
      [accountId, limit, offset]
    );
    return result[0]?.values.map((v) => this.rowToMessage(v)) || [];
  }

  markMessageRead(id: string, isRead: boolean = true): void {
    this.ensureInitialized();
    this.db!.run(`UPDATE messages SET is_read = ? WHERE id = ?`, [isRead ? 1 : 0, id]);
    this.save();
  }

  searchMessages(query: string, accountId?: string): Message[] {
    this.ensureInitialized();
    let sql = `SELECT * FROM messages WHERE subject LIKE ? OR sender LIKE ? OR body LIKE ?`;
    const params: (string | number)[] = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (accountId) {
      sql += ` AND account_id = ?`;
      params.push(accountId);
    }

    sql += ' ORDER BY received_at DESC LIMIT 100';

    const result = this.db!.exec(sql, params);
    return result[0]?.values.map((v) => this.rowToMessage(v)) || [];
  }

  // ─── Verification code operations ───

  createVerificationCode(data: Omit<VerificationCode, 'id'>): VerificationCode {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO verification_codes (id, message_id, identity_id, sender, service_label, code, code_type, received_at, expires_at, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.message_id,
        data.identity_id,
        data.sender,
        data.service_label,
        data.code,
        data.code_type,
        data.received_at,
        data.expires_at,
        data.status,
        data.notes,
      ]
    );
    this.save();
    return this.getVerificationCodeById(id)!;
  }

  getVerificationCodeById(id: string): VerificationCode | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM verification_codes WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToVerificationCode(result[0].values[0]);
  }

  getVerificationCodesByIdentity(identityId: string): VerificationCode[] {
    this.ensureInitialized();
    const result = this.db!.exec(
      `SELECT * FROM verification_codes WHERE identity_id = ? ORDER BY received_at DESC`,
      [identityId]
    );
    return result[0]?.values.map((v) => this.rowToVerificationCode(v)) || [];
  }

  updateVerificationCodeStatus(id: string, status: string): VerificationCode | null {
    this.ensureInitialized();
    this.db!.run(`UPDATE verification_codes SET status = ? WHERE id = ?`, [status, id]);
    this.save();
    return this.getVerificationCodeById(id);
  }

  // ─── Browser profile operations ───

  createBrowserProfile(data: Omit<BrowserProfile, 'id' | 'created_at'>): BrowserProfile {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO browser_profiles (id, name, browser, directory, identity_id, status, last_launched_at, last_closed_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.browser,
        data.directory,
        data.identity_id,
        data.status,
        data.last_launched_at,
        data.last_closed_at,
        data.notes,
      ]
    );
    this.save();
    return this.getBrowserProfileById(id)!;
  }

  getBrowserProfileById(id: string): BrowserProfile | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM browser_profiles WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToBrowserProfile(result[0].values[0]);
  }

  getAllBrowserProfiles(): BrowserProfile[] {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM browser_profiles ORDER BY created_at DESC`);
    return result[0]?.values.map((v) => this.rowToBrowserProfile(v)) || [];
  }

  updateBrowserProfile(id: string, data: Partial<Omit<BrowserProfile, 'id' | 'created_at'>>): BrowserProfile | null {
    this.ensureInitialized();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.browser !== undefined) { fields.push('browser = ?'); values.push(data.browser); }
    if (data.directory !== undefined) { fields.push('directory = ?'); values.push(data.directory); }
    if (data.identity_id !== undefined) { fields.push('identity_id = ?'); values.push(data.identity_id); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.last_launched_at !== undefined) { fields.push('last_launched_at = ?'); values.push(data.last_launched_at); }
    if (data.last_closed_at !== undefined) { fields.push('last_closed_at = ?'); values.push(data.last_closed_at); }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }

    if (fields.length === 0) return this.getBrowserProfileById(id);

    values.push(id);
    this.db!.run(`UPDATE browser_profiles SET ${fields.join(', ')} WHERE id = ?`, values);
    this.save();
    return this.getBrowserProfileById(id);
  }

  deleteBrowserProfile(id: string): boolean {
    this.ensureInitialized();
    this.db!.run(`DELETE FROM browser_profiles WHERE id = ?`, [id]);
    this.save();
    // Verify deletion by checking if row still exists
    const check = this.db!.exec(`SELECT id FROM browser_profiles WHERE id = ?`, [id]);
    return check.length === 0 || check[0].values.length === 0;
  }

  // Session operations

  createSession(data: SessionInput): Session {
    this.ensureInitialized();
    const id = this.generateId();
    const started_at = data.started_at ?? new Date().toISOString();
    const ended_at = data.ended_at ?? null;
    const duration_ms = data.duration_ms ?? null;
    const status = data.status ?? 'active';
    const test_run_id = data.test_run_id ?? null;
    const notes = data.notes ?? null;
    this.db!.run(
      `INSERT INTO sessions (id, profile_id, identity_id, started_at, ended_at, duration_ms, status, test_run_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.profile_id,
        data.identity_id,
        started_at,
        ended_at,
        duration_ms,
        status,
        test_run_id,
        notes,
      ]
    );
    this.save();
    return this.getSessionById(id)!;
  }

  getSessionById(id: string): Session | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM sessions WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToSession(result[0].values[0]);
  }

  getSessionsByProfile(profileId: string): Session[] {
    this.ensureInitialized();
    const result = this.db!.exec(
      `SELECT * FROM sessions WHERE profile_id = ? ORDER BY started_at DESC`,
      [profileId]
    );
    return result[0]?.values.map((v) => this.rowToSession(v)) || [];
  }

  getActiveSessions(): Session[] {
    this.ensureInitialized();
    const result = this.db!.exec(
      `SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC`
    );
    return result[0]?.values.map((v) => this.rowToSession(v)) || [];
  }

  endSession(id: string): Session | null {
    this.ensureInitialized();
    const session = this.getSessionById(id);
    if (!session) return null;

    const started = new Date(session.started_at).getTime();
    const ended = Date.now();
    const duration = ended - started;

    this.db!.run(
      `UPDATE sessions SET ended_at = datetime('now'), duration_ms = ?, status = 'completed' WHERE id = ?`,
      [duration, id]
    );
    this.save();
    return this.getSessionById(id);
  }

  // ─── Test run operations ───

  createTestRun(data: Omit<TestRun, 'id'>): TestRun {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO test_runs (id, name, target_environment, profile_id, identity_id, started_at, ended_at, status, logs, screenshots, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.target_environment,
        data.profile_id,
        data.identity_id,
        data.started_at,
        data.ended_at,
        data.status,
        data.logs,
        data.screenshots,
        data.result,
      ]
    );
    this.save();
    return this.getTestRunById(id)!;
  }

  getTestRunById(id: string): TestRun | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM test_runs WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToTestRun(result[0].values[0]);
  }

  getAllTestRuns(): TestRun[] {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM test_runs ORDER BY started_at DESC NULLS LAST`);
    return result[0]?.values.map((v) => this.rowToTestRun(v)) || [];
  }

  updateTestRunStatus(id: string, status: string, result?: string): TestRun | null {
    this.ensureInitialized();
    this.db!.run(
      `UPDATE test_runs SET status = ?, ended_at = datetime('now'), result = ? WHERE id = ?`,
      [status, result || null, id]
    );
    this.save();
    return this.getTestRunById(id);
  }

  addTestRunLog(id: string, logEntry: string): void {
    this.ensureInitialized();
    const run = this.getTestRunById(id);
    if (!run) return;

    const logs = JSON.parse(run.logs) as string[];
    logs.push(logEntry);
    this.db!.run(`UPDATE test_runs SET logs = ? WHERE id = ?`, [JSON.stringify(logs), id]);
    this.save();
  }

  // ─── Activity log operations ───

  createActivityLog(data: Omit<ActivityLog, 'id' | 'timestamp'>): ActivityLog {
    this.ensureInitialized();
    const id = this.generateId();
    this.db!.run(
      `INSERT INTO activity_logs (id, timestamp, action, entity, entity_id, actor, result, details)
       VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)`,
      [id, data.action, data.entity, data.entity_id, data.actor, data.result, data.details]
    );
    this.save();
    return this.getActivityLogById(id)!;
  }

  getActivityLogById(id: string): ActivityLog | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM activity_logs WHERE id = ?`, [id]);
    if (result.length === 0) return null;
    return this.rowToActivityLog(result[0].values[0]);
  }

  getRecentActivityLogs(limit = 50): ActivityLog[] {
    this.ensureInitialized();
    const result = this.db!.exec(
      `SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
    return result[0]?.values.map((v) => this.rowToActivityLog(v)) || [];
  }

  getActivityLogsByAction(action: string): ActivityLog[] {
    this.ensureInitialized();
    const result = this.db!.exec(
      `SELECT * FROM activity_logs WHERE action = ? ORDER BY timestamp DESC`,
      [action]
    );
    return result[0]?.values.map((v) => this.rowToActivityLog(v)) || [];
  }

  // ─── Settings operations ───

  getSetting(key: string): string | null {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT value FROM settings WHERE key = ?`, [key]);
    if (result.length === 0) return null;
    return result[0].values[0][0] as string;
  }

  setSetting(key: string, value: string): void {
    this.ensureInitialized();
    this.db!.run(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
    this.save();
  }

  getAllSettings(): Setting[] {
    this.ensureInitialized();
    const result = this.db!.exec(`SELECT * FROM settings ORDER BY key`);
    return result[0]?.values.map((v) => ({
      key: v[0] as string,
      value: v[1] as string,
      updated_at: v[2] as string,
    })) || [];
  }

  // ─── Helper methods ───

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  private generateId(): string {
    const crypto = typeof globalThis !== 'undefined' && (globalThis as any).crypto;
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private rowToIdentity(row: any[]): Identity {
    return {
      id: row[0],
      email: row[1],
      display_name: row[2],
      provider: row[3],
      status: row[4],
      tags: row[5],
      notes: row[6],
      created_at: row[7],
      last_used_at: row[8],
      browser_profile_id: row[9],
      verification_status: row[10],
      source: row[11],
      metadata: row[12],
    };
  }

  private rowToEmailAccount(row: any[]): EmailAccount {
    return {
      id: row[0],
      identity_id: row[1],
      provider_type: row[2],
      config: row[3],
      is_active: row[4],
      created_at: row[5],
      last_synced_at: row[6],
    };
  }

  private rowToMessage(row: any[]): Message {
    return {
      id: row[0],
      account_id: row[1],
      message_id_external: row[2],
      subject: row[3],
      sender: row[4],
      recipient: row[5],
      body: row[6],
      body_html: row[7],
      received_at: row[8],
      is_read: row[9],
      attachments: row[10],
      raw_headers: row[11],
    };
  }

  private rowToVerificationCode(row: any[]): VerificationCode {
    return {
      id: row[0],
      message_id: row[1],
      identity_id: row[2],
      sender: row[3],
      service_label: row[4],
      code: row[5],
      code_type: row[6],
      received_at: row[7],
      expires_at: row[8],
      status: row[9],
      notes: row[10],
    };
  }

  private rowToBrowserProfile(row: any[]): BrowserProfile {
    return {
      id: row[0],
      name: row[1],
      browser: row[2],
      directory: row[3],
      identity_id: row[4],
      status: row[5],
      created_at: row[6],
      last_launched_at: row[7],
      last_closed_at: row[8],
      notes: row[9],
    };
  }

  private rowToSession(row: any[]): Session {
    return {
      id: row[0],
      profile_id: row[1],
      identity_id: row[2],
      started_at: row[3],
      ended_at: row[4],
      duration_ms: row[5],
      status: row[6],
      test_run_id: row[7],
      notes: row[8],
    };
  }

  private rowToTestRun(row: any[]): TestRun {
    return {
      id: row[0],
      name: row[1],
      target_environment: row[2],
      profile_id: row[3],
      identity_id: row[4],
      started_at: row[5],
      ended_at: row[6],
      status: row[7],
      logs: row[8],
      screenshots: row[9],
      result: row[10],
    };
  }

  private rowToActivityLog(row: any[]): ActivityLog {
    return {
      id: row[0],
      timestamp: row[1],
      action: row[2],
      entity: row[3],
      entity_id: row[4],
      actor: row[5],
      result: row[6],
      details: row[7],
    };
  }
}

// Singleton export
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}
