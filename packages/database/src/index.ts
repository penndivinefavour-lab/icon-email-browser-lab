/** @file database/src/index.ts — sql.js with cross-platform support for Node.js + browser */
// @ts-nocheck
import initSqlJs from 'sql.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQLJS_WASM_PATH = path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

declare const process: { cwd(): string } | undefined;
declare const window: { localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } } | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: (mod: string) => any;

function isBrowser(): boolean { return typeof window !== 'undefined'; }

// ─── Cross-platform I/O ─────────────────────────────────────────────
async function readBinary(filePath: string): Promise<ArrayBuffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = isBrowser()
    ? (await fetch(filePath)).arrayBuffer()
    : require('fs').readFileSync(filePath);
  if (buf instanceof Uint8Array) return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  if (buf instanceof ArrayBuffer) return buf;
  return new Uint8Array(buf).buffer as ArrayBuffer;
}

async function fileExists(filePath: string): Promise<boolean> {
  return isBrowser()
    ? ((await fetch(filePath, { method: 'HEAD' })).ok)
    : require('fs').existsSync(filePath);
}

async function persistDb(data: ArrayBuffer, filePath: string): Promise<void> {
  if (isBrowser()) {
    window!.localStorage.setItem('icon_lab_db', Buffer.from(data).toString('base64'));
  } else {
    require('fs').writeFileSync(filePath, Buffer.from(data));
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  if (!isBrowser()) {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getDbPath(): string {
  return isBrowser() ? 'data/icon-lab.db' : path.join(process!.cwd(), 'data', 'icon-lab.db');
}

function getWasmPath(): string {
  return isBrowser() ? 'data/sql-wasm.wasm' : SQLJS_WASM_PATH;
}

async function initSqlJsEnv(): Promise<{ Database: new (data?: ArrayLike<number> | null) => import('@types/sql.js').Database }> {
  if (isBrowser()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Module = await import('../node_modules/sql.js/dist/sql-wasm.js') as any;
    // @ts-expect-error - dynamic import of sql-wasm.js AMD module
    const sqlJs = await Module.default({ locateFile: (f: string) => `data/${f}` });
    return sqlJs as any;
  }
  const wasmBin = await readBinary(SQLJS_WASM_PATH);
  const safeWasm: ArrayBuffer = wasmBin instanceof ArrayBuffer ? wasmBin : new Uint8Array(wasmBin).buffer as unknown as ArrayBuffer;
  const sqlJs = await initSqlJs({ wasmBinary: safeWasm });
  return sqlJs;
}

// ─── Row converters ──────────────────────────────────────────────────
function rowToIdentity(r: (string | number | null)[]): Identity {
  return { id: r[0] as string, email: r[1] as string, display_name: r[2] as string | null, provider: r[3] as string, status: r[4] as string, tags: r[5] as string, notes: r[6] as string | null, created_at: r[7] as string, last_used_at: r[8] as string | null, browser_profile_id: r[9] as string | null, verification_status: r[10] as string, source: r[11] as string, metadata: r[12] as string };
}
function rowToBrowserProfile(r: (string | number | null)[]): BrowserProfile {
  return { id: r[0] as string, name: r[1] as string, browser: r[2] as string, directory: r[3] as string, identity_id: r[4] as string | null, status: r[5] as string, cookies_count: r[6] as number, localStorage_count: r[7] as number, session_count: r[8] as number, last_used_at: r[9] as string | null, created_at: r[10] as string };
}
function rowToSession(r: (string | number | null)[]): Session {
  return { id: r[0] as string, profile_id: r[1] as string, identity_id: r[2] as string | null, started_at: r[3] as string, ended_at: r[4] as string | null, duration_ms: r[5] as number | null, status: r[6] as string, test_run_id: r[7] as string | null, notes: r[8] as string | null };
}
function rowToTestRun(r: (string | number | null)[]): TestRun {
  return { id: r[0] as string, name: r[1] as string, target_environment: r[2] as string, profile_id: r[3] as string | null, identity_id: r[4] as string | null, started_at: r[5] as string | null, ended_at: r[6] as string | null, status: r[7] as string, logs: r[8] as string, screenshots: r[9] as string, result: r[10] as string | null };
}
function rowToTestArtifact(r: (string | number | null)[]): TestArtifact {
  return { id: r[0] as string, test_run_id: r[1] as string, artifact_type: r[2] as string, file_path: r[3] as string, description: r[4] as string | null, created_at: r[5] as string };
}
function rowToActivityLog(r: (string | number | null)[]): ActivityLog {
  return { id: r[0] as string, timestamp: r[1] as string, action: r[2] as string, actor: r[3] as string | null, entity_type: r[4] as string, entity_id: r[5] as string | null, details: r[6] as string, ip_address: r[7] as string | null, session_id: r[8] as string | null, user_agent: r[9] as string | null };
}
function rowToSetting(r: (string | number | null)[]): Setting { return { key: r[0] as string, value: r[1] as string, updated_at: r[2] as string }; }
function rowToEmailAccount(r: (string | number | null)[]): EmailAccount {
  return { id: r[0] as string, identity_id: r[1] as string, provider_type: r[2] as string, config: r[3] as string, is_active: r[4] as number, created_at: r[5] as string, last_synced_at: r[6] as string | null };
}
function rowToMessage(r: (string | number | null)[]): Message {
  return { id: r[0] as string, account_id: r[1] as string, message_id_external: r[2] as string | null, subject: r[3] as string, sender: r[4] as string, recipient: r[5] as string, body: r[6] as string | null, body_html: r[7] as string | null, received_at: r[8] as string, is_read: r[9] as number, attachments: r[10] as string, raw_headers: r[11] as string | null };
}
function rowToVerificationCode(r: (string | number | null)[]): VerificationCode {
  return { id: r[0] as string, message_id: r[1] as string, identity_id: r[2] as string, sender: r[3] as string, service_label: r[4] as string | null, code: r[5] as string, code_type: r[6] as string, received_at: r[7] as string, expires_at: r[8] as string | null, status: r[9] as string, notes: r[10] as string | null };
}

function genId(): string { const b = crypto.getRandomValues(new Uint8Array(16)); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }

// ─── Schema interfaces ───────────────────────────────────────────────
export interface Identity { id: string; email: string; display_name: string | null; provider: string; status: string; tags: string; notes: string | null; created_at: string; last_used_at: string | null; browser_profile_id: string | null; verification_status: string; source: string; metadata: string; }
export interface BrowserProfile { id: string; name: string; browser: string; directory: string; identity_id: string | null; status: string; cookies_count: number; localStorage_count: number; session_count: number; last_used_at: string | null; created_at: string; notes?: string | null; }
export interface Session { id: string; profile_id: string; identity_id: string | null; started_at: string; ended_at: string | null; duration_ms: number | null; status: string; test_run_id: string | null; notes: string | null; }
export interface TestRun { id: string; name: string; target_environment: string; profile_id: string | null; identity_id: string | null; started_at: string | null; ended_at: string | null; status: string; logs: string; screenshots: string; result: string | null; }
export interface TestArtifact { id: string; test_run_id: string; artifact_type: string; file_path: string; description: string | null; created_at: string; }
export interface ActivityLog { id: string; timestamp: string; action: string; actor: string | null; entity_type: string; entity_id: string | null; details: string; ip_address: string | null; session_id: string | null; user_agent: string | null; result?: string | null; entity?: string | null; }
export interface Setting { key: string; value: string; updated_at: string; }
export interface EmailAccount { id: string; identity_id: string; provider_type: string; config: string; is_active: number; created_at: string; last_synced_at: string | null; }
export interface Message { id: string; account_id: string; message_id_external: string | null; subject: string; sender: string; recipient: string; body: string | null; body_html: string | null; received_at: string; is_read: number; attachments: string; raw_headers: string | null; }
export interface VerificationCode { id: string; message_id: string; identity_id: string; sender: string; service_label: string | null; code: string; code_type: string; received_at: string; expires_at: string | null; status: string; notes: string | null; }

// ─── Database class ──────────────────────────────────────────────────
export class Database {
  private db: import('sql.js').Database | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath?: string) { this.dbPath = dbPath || getDbPath(); }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await ensureDir(path.dirname(this.dbPath));
    const sqlJs = await initSqlJsEnv();
    const DatabaseCtor = sqlJs.Database;
    if (await fileExists(this.dbPath)) {
      this.db = new DatabaseCtor(await readBinary(this.dbPath));
    } else {
      this.db = new DatabaseCtor();
    }
    this.runMigrations();
    this.initialized = true;
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('DB not initialized');
    this.db.run(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    const sqls = [
      `CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT, provider TEXT NOT NULL DEFAULT 'other', status TEXT NOT NULL DEFAULT 'available', tags TEXT NOT NULL DEFAULT '', notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT, browser_profile_id TEXT, verification_status TEXT NOT NULL DEFAULT 'unverified', source TEXT NOT NULL DEFAULT 'manual', metadata TEXT NOT NULL DEFAULT '{}')`,
      `CREATE TABLE IF NOT EXISTS email_accounts (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, provider_type TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_synced_at TEXT, FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, message_id_external TEXT, subject TEXT NOT NULL DEFAULT '', sender TEXT NOT NULL DEFAULT '', recipient TEXT NOT NULL DEFAULT '', body TEXT, body_html TEXT, received_at TEXT NOT NULL DEFAULT (datetime('now')), is_read INTEGER NOT NULL DEFAULT 0, attachments TEXT NOT NULL DEFAULT '{}', raw_headers TEXT, FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS verification_codes (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, identity_id TEXT NOT NULL, sender TEXT NOT NULL DEFAULT '', service_label TEXT, code TEXT NOT NULL, code_type TEXT NOT NULL DEFAULT 'otp', received_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE, FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS browser_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, browser TEXT NOT NULL DEFAULT 'chromium', directory TEXT NOT NULL, identity_id TEXT, status TEXT NOT NULL DEFAULT 'idle', cookies_count INTEGER NOT NULL DEFAULT 0, localStorage_count INTEGER NOT NULL DEFAULT 0, session_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL)`,
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, identity_id TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), ended_at TEXT, duration_ms INTEGER, status TEXT NOT NULL DEFAULT 'active', test_run_id TEXT, notes TEXT, FOREIGN KEY (profile_id) REFERENCES browser_profiles(id) ON DELETE CASCADE, FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL, FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE SET NULL)`,
      `CREATE TABLE IF NOT EXISTS test_runs (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_environment TEXT NOT NULL, profile_id TEXT, identity_id TEXT, started_at TEXT, ended_at TEXT, status TEXT NOT NULL DEFAULT 'pending', logs TEXT NOT NULL DEFAULT '', screenshots TEXT NOT NULL DEFAULT '{}', result TEXT)`,
      `CREATE TABLE IF NOT EXISTS test_artifacts (id TEXT PRIMARY KEY, test_run_id TEXT NOT NULL, artifact_type TEXT NOT NULL, file_path TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL DEFAULT (datetime('now')), action TEXT NOT NULL, actor TEXT, entity_type TEXT NOT NULL, entity_id TEXT, details TEXT NOT NULL DEFAULT '{}', ip_address TEXT, session_id TEXT, user_agent TEXT)`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ];
    for (const s of sqls) this.db.run(s);
    this.db.run(`INSERT OR IGNORE INTO _migrations (name, applied_at) VALUES ('initial_schema', datetime('now'))`);
  }

  private ensureInit(): void { if (!this.initialized) throw new Error('DB not initialized'); if (!this.db) throw new Error('DB closed'); }

  save(): void { if (this.db) persistDb(this.db.export(), this.dbPath); }
  close(): void { if (this.db) { this.save(); this.db.close(); this.db = null; this.initialized = false; } }

  // ── Identities ──────────────────────────────────────────────────────
  createIdentity(d: { email: string; display_name?: string | null; provider?: string; status?: string; tags?: string; notes?: string | null; last_used_at?: string | null; browser_profile_id?: string | null; verification_status?: string; source?: string; metadata?: string }): Identity {
    this.ensureInit(); const id = genId(); const now = new Date().toISOString();
    this.db!.run(`INSERT INTO identities (id,email,display_name,provider,status,tags,notes,created_at,last_used_at,browser_profile_id,verification_status,source,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, d.email, d.display_name ?? null, d.provider ?? 'other', d.status ?? 'available', d.tags ?? '', d.notes ?? null, now, d.last_used_at ?? null, d.browser_profile_id ?? null, d.verification_status ?? 'unverified', d.source ?? 'manual', d.metadata ?? '{}']);
    this.save(); return this.getIdentityById(id)!;
  }
  getIdentityById(id: string): Identity | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM identities WHERE id=?`, [id]); return r.length ? rowToIdentity(r[0].values[0] as (string | number | null)[]) : null; }
  getAllIdentities(): Identity[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM identities ORDER BY created_at DESC`); return r[0]?.values.map((row: (string | number | null)[]) => rowToIdentity(row)) ?? []; }
  updateIdentity(id: string, d: Partial<Omit<Identity, 'id' | 'created_at'>>): Identity | null {
    this.ensureInit(); const f: string[] = []; const v: (string | number | null)[] = [];
    if (d.email !== undefined) { f.push('email=?'); v.push(d.email); } if (d.display_name !== undefined) { f.push('display_name=?'); v.push(d.display_name); } if (d.provider !== undefined) { f.push('provider=?'); v.push(d.provider); } if (d.status !== undefined) { f.push('status=?'); v.push(d.status); } if (d.tags !== undefined) { f.push('tags=?'); v.push(d.tags); } if (d.notes !== undefined) { f.push('notes=?'); v.push(d.notes); } if (d.last_used_at !== undefined) { f.push('last_used_at=?'); v.push(d.last_used_at); } if (d.browser_profile_id !== undefined) { f.push('browser_profile_id=?'); v.push(d.browser_profile_id); } if (d.verification_status !== undefined) { f.push('verification_status=?'); v.push(d.verification_status); } if (d.source !== undefined) { f.push('source=?'); v.push(d.source); } if (d.metadata !== undefined) { f.push('metadata=?'); v.push(d.metadata); }
    if (!f.length) return this.getIdentityById(id);
    v.push(id); this.db!.run(`UPDATE identities SET ${f.join(',')} WHERE id=?`, v); this.save(); return this.getIdentityById(id);
  }
  deleteIdentity(id: string): boolean { this.ensureInit(); this.db!.run(`DELETE FROM identities WHERE id=?`, [id]); this.save(); return !this.getIdentityById(id); }
  filterIdentities(f: { status?: string; provider?: string; tags?: string; search?: string }): Identity[] {
    this.ensureInit(); let sql = 'SELECT * FROM identities WHERE 1=1'; const p: (string | number)[] = [];
    if (f.status) { sql += ' AND status=?'; p.push(f.status); } if (f.provider) { sql += ' AND provider=?'; p.push(f.provider); } if (f.tags) { sql += ' AND tags LIKE ?'; p.push(`%${f.tags}%`); }
    if (f.search) { const s = `%${f.search}%`; sql += ' AND (email LIKE ? OR display_name LIKE ? OR notes LIKE ? OR tags LIKE ? OR source LIKE ?)'; p.push(s, s, s, s, s); }
    sql += ' ORDER BY created_at DESC'; const r = this.db!.exec(sql, p); return r[0]?.values.map((row: (string | number | null)[]) => rowToIdentity(row)) ?? [];
  }

  // ── Browser profiles ────────────────────────────────────────────────
  createBrowserProfile(d: { name: string; browser?: string; directory?: string; identity_id?: string | null }): BrowserProfile {
    this.ensureInit(); const id = genId(); const dir = d.directory ?? path.join(process!.cwd() || '', 'browser-profiles', id);
    this.db!.run(`INSERT INTO browser_profiles (id,name,browser,directory,identity_id,status,created_at) VALUES (?,?,?,?,?,'idle',datetime('now'))`, [id, d.name, d.browser ?? 'chromium', dir, d.identity_id ?? null]); this.save(); return this.getBrowserProfileById(id)!;
  }
  getBrowserProfileById(id: string): BrowserProfile | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM browser_profiles WHERE id=?`, [id]); return r.length ? rowToBrowserProfile(r[0].values[0]) : null; }
  getAllBrowserProfiles(): BrowserProfile[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM browser_profiles ORDER BY created_at DESC`); return r[0]?.values.map(rowToBrowserProfile) ?? []; }
  updateBrowserProfile(id: string, d: Partial<Omit<BrowserProfile, 'id' | 'created_at'>>): BrowserProfile | null {
    this.ensureInit(); const f: string[] = []; const v: (string | number | null)[] = [];
    if (d.name !== undefined) { f.push('name=?'); v.push(d.name); } if (d.browser !== undefined) { f.push('browser=?'); v.push(d.browser); } if (d.directory !== undefined) { f.push('directory=?'); v.push(d.directory); } if (d.identity_id !== undefined) { f.push('identity_id=?'); v.push(d.identity_id); } if (d.status !== undefined) { f.push('status=?'); v.push(d.status); } if (d.cookies_count !== undefined) { f.push('cookies_count=?'); v.push(d.cookies_count); } if (d.localStorage_count !== undefined) { f.push('localStorage_count=?'); v.push(d.localStorage_count); } if (d.session_count !== undefined) { f.push('session_count=?'); v.push(d.session_count); } if (d.last_used_at !== undefined) { f.push('last_used_at=?'); v.push(d.last_used_at); }
    if (!f.length) return this.getBrowserProfileById(id);
    v.push(id); this.db!.run(`UPDATE browser_profiles SET ${f.join(',')} WHERE id=?`, v); this.save(); return this.getBrowserProfileById(id);
  }
  deleteBrowserProfile(id: string): boolean { this.ensureInit(); this.db!.run(`DELETE FROM browser_profiles WHERE id=?`, [id]); this.save(); return !this.getBrowserProfileById(id); }

  // ── Sessions ────────────────────────────────────────────────────────
  createSession(d: { profile_id: string; identity_id?: string | null; status?: string; test_run_id?: string | null; notes?: string | null }): Session {
    this.ensureInit(); const id = genId(); const now = new Date().toISOString();
    this.db!.run(`INSERT INTO sessions (id,profile_id,identity_id,started_at,status,test_run_id,notes) VALUES (?,?,?,?,?,?,?)`, [id, d.profile_id, d.identity_id ?? null, now, d.status ?? 'active', d.test_run_id ?? null, d.notes ?? null]); this.save(); return this.getSessionById(id)!;
  }
  getSessionById(id: string): Session | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM sessions WHERE id=?`, [id]); return r.length ? rowToSession(r[0].values[0]) : null; }
  getAllSessions(): Session[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM sessions ORDER BY started_at DESC`); return r[0]?.values.map(rowToSession) ?? []; }
  getActiveSessions(): Session[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM sessions WHERE status='active' ORDER BY started_at DESC`); return r[0]?.values.map(rowToSession) ?? []; }
  updateSession(id: string, d: Partial<Omit<Session, 'id' | 'started_at'>>): Session | null {
    this.ensureInit(); const f: string[] = []; const v: (string | number | null)[] = [];
    if (d.ended_at !== undefined) { f.push('ended_at=?'); v.push(d.ended_at); } if (d.duration_ms !== undefined) { f.push('duration_ms=?'); v.push(d.duration_ms); } if (d.status !== undefined) { f.push('status=?'); v.push(d.status); } if (d.test_run_id !== undefined) { f.push('test_run_id=?'); v.push(d.test_run_id); } if (d.notes !== undefined) { f.push('notes=?'); v.push(d.notes); }
    if (!f.length) return this.getSessionById(id);
    v.push(id); this.db!.run(`UPDATE sessions SET ${f.join(',')} WHERE id=?`, v); this.save(); return this.getSessionById(id);
  }
  endSession(id: string): Session | null { this.ensureInit(); const s = this.getSessionById(id); if (!s) return null; const endedAt = new Date().toISOString(); const dur = s.started_at ? Date.now() - new Date(s.started_at).getTime() : null; this.db!.run(`UPDATE sessions SET ended_at=?, duration_ms=?, status='completed' WHERE id=?`, [endedAt, dur, id]); this.save(); return this.getSessionById(id); }

  // ── Test runs ───────────────────────────────────────────────────────
  createTestRun(d: { name: string; target_environment?: string; profile_id?: string | null; identity_id?: string | null }): TestRun {
    this.ensureInit(); const id = genId();
    this.db!.run(`INSERT INTO test_runs (id,name,target_environment,profile_id,identity_id,started_at,status) VALUES (?,?,?,?,?,datetime('now'),'running')`, [id, d.name, d.target_environment ?? 'local', d.profile_id ?? null, d.identity_id ?? null]); this.save(); return this.getTestRunById(id)!;
  }
  getTestRunById(id: string): TestRun | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM test_runs WHERE id=?`, [id]); return r.length ? rowToTestRun(r[0].values[0]) : null; }
  getAllTestRuns(): TestRun[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM test_runs ORDER BY started_at DESC`); return r[0]?.values.map(rowToTestRun) ?? []; }
  updateTestRun(id: string, d: Partial<Omit<TestRun, 'id'>>): TestRun | null {
    this.ensureInit(); const f: string[] = []; const v: (string | number | null)[] = [];
    if (d.name !== undefined) { f.push('name=?'); v.push(d.name); } if (d.target_environment !== undefined) { f.push('target_environment=?'); v.push(d.target_environment); } if (d.profile_id !== undefined) { f.push('profile_id=?'); v.push(d.profile_id); } if (d.identity_id !== undefined) { f.push('identity_id=?'); v.push(d.identity_id); } if (d.started_at !== undefined) { f.push('started_at=?'); v.push(d.started_at); } if (d.ended_at !== undefined) { f.push('ended_at=?'); v.push(d.ended_at); } if (d.status !== undefined) { f.push('status=?'); v.push(d.status); } if (d.logs !== undefined) { f.push('logs=?'); v.push(d.logs); } if (d.screenshots !== undefined) { f.push('screenshots=?'); v.push(d.screenshots); } if (d.result !== undefined) { f.push('result=?'); v.push(d.result); }
    if (!f.length) return this.getTestRunById(id);
    v.push(id); this.db!.run(`UPDATE test_runs SET ${f.join(',')} WHERE id=?`, v); this.save(); return this.getTestRunById(id);
  }
  endTestRun(id: string, result: string): TestRun | null { this.ensureInit(); const now = new Date().toISOString(); this.db!.run(`UPDATE test_runs SET ended_at=?, status='completed', result=? WHERE id=?`, [now, result, id]); this.save(); return this.getTestRunById(id); }

  // ── Test artifacts ──────────────────────────────────────────────────
  createTestArtifact(d: { test_run_id: string; artifact_type: string; file_path: string; description?: string | null }): TestArtifact {
    this.ensureInit(); const id = genId();
    this.db!.run(`INSERT INTO test_artifacts (id,test_run_id,artifact_type,file_path,description) VALUES (?,?,?,?,?)`, [id, d.test_run_id, d.artifact_type, d.file_path, d.description ?? null]); this.save(); return this.getTestArtifactById(id)!;
  }
  getTestArtifactById(id: string): TestArtifact | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM test_artifacts WHERE id=?`, [id]); return r.length ? rowToTestArtifact(r[0].values[0]) : null; }
  getTestArtifactsByRun(testRunId: string): TestArtifact[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM test_artifacts WHERE test_run_id=? ORDER BY created_at DESC`, [testRunId]); return r[0]?.values.map(rowToTestArtifact) ?? []; }

  // ── Activity logs ───────────────────────────────────────────────────
  logActivity(d: { action: string; actor?: string | null; entity_type?: string; entity_id?: string | null; details?: string; ip_address?: string | null; session_id?: string | null; user_agent?: string | null }): ActivityLog {
    this.ensureInit(); const id = genId(); const now = new Date().toISOString();
    this.db!.run(`INSERT INTO activity_logs (id,timestamp,action,actor,entity_type,entity_id,details,ip_address,session_id,user_agent) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, now, d.action, d.actor ?? null, d.entity_type ?? 'general', d.entity_id ?? null, d.details ?? '{}', d.ip_address ?? null, d.session_id ?? null, d.user_agent ?? null]); this.save(); return this.getActivityLogById(id)!;
  }
  getActivityLogById(id: string): ActivityLog | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM activity_logs WHERE id=?`, [id]); return r.length ? rowToActivityLog(r[0].values[0]) : null; }
  getAllActivityLogs(): ActivityLog[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM activity_logs ORDER BY timestamp DESC`); return r[0]?.values.map(rowToActivityLog) ?? []; }
  getRecentActivityLogs(limit = 50): ActivityLog[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?`, [limit]); return r[0]?.values.map(rowToActivityLog) ?? []; }

  // ── Settings ────────────────────────────────────────────────────────
  getSetting(key: string): Setting | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM settings WHERE key=?`, [key]); return r.length ? rowToSetting(r[0].values[0]) : null; }
  setSetting(key: string, value: string): Setting { this.ensureInit(); const now = new Date().toISOString(); this.db!.run(`INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,?)`, [key, value, now]); this.save(); return this.getSetting(key)!; }
  getAllSettings(): Setting[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM settings`); return r[0]?.values.map(rowToSetting) ?? []; }
  getSettingValue(key: string, def?: string): string { const s = this.getSetting(key); if (!s) return def ?? ''; try { const p = JSON.parse(s.value); return typeof p === 'string' ? p : JSON.stringify(p); } catch { return s.value; } }
  setSettingValue(key: string, value: string | object): void { this.setSetting(key, typeof value === 'string' ? value : JSON.stringify(value)); }

  // ── Email accounts ──────────────────────────────────────────────────
  createEmailAccount(d: { identity_id: string; provider_type: string; config?: string; is_active?: number }): EmailAccount {
    this.ensureInit(); const id = genId(); const now = new Date().toISOString();
    this.db!.run(`INSERT INTO email_accounts (id,identity_id,provider_type,config,is_active,created_at) VALUES (?,?,?,?,?,?)`, [id, d.identity_id, d.provider_type, d.config ?? '{}', d.is_active ?? 1, now]); this.save(); return this.getEmailAccountById(id)!;
  }
  getEmailAccountById(id: string): EmailAccount | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM email_accounts WHERE id=?`, [id]); return r.length ? rowToEmailAccount(r[0].values[0]) : null; }
  getEmailAccountsByIdentity(identityId: string): EmailAccount[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM email_accounts WHERE identity_id=? ORDER BY created_at DESC`, [identityId]); return r[0]?.values.map(rowToEmailAccount) ?? []; }
  getAllEmailAccounts(): EmailAccount[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM email_accounts ORDER BY created_at DESC`); return r[0]?.values.map(rowToEmailAccount) ?? []; }
  updateEmailAccount(id: string, d: Partial<Omit<EmailAccount, 'id' | 'created_at'>>): EmailAccount | null {
    this.ensureInit(); const f: string[] = []; const v: (string | number | null)[] = [];
    if (d.identity_id !== undefined) { f.push('identity_id=?'); v.push(d.identity_id); } if (d.provider_type !== undefined) { f.push('provider_type=?'); v.push(d.provider_type); } if (d.config !== undefined) { f.push('config=?'); v.push(d.config); } if (d.is_active !== undefined) { f.push('is_active=?'); v.push(d.is_active); } if (d.last_synced_at !== undefined) { f.push('last_synced_at=?'); v.push(d.last_synced_at); }
    if (!f.length) return this.getEmailAccountById(id);
    v.push(id); this.db!.run(`UPDATE email_accounts SET ${f.join(',')} WHERE id=?`, v); this.save(); return this.getEmailAccountById(id);
  }

  // ── Messages ────────────────────────────────────────────────────────
  createMessage(d: { account_id: string; message_id_external?: string | null; subject?: string; sender?: string; recipient?: string; body?: string | null; body_html?: string | null; received_at?: string; is_read?: number; attachments?: string; raw_headers?: string | null }): Message {
    this.ensureInit(); const id = genId();
    this.db!.run(`INSERT INTO messages (id,account_id,message_id_external,subject,sender,recipient,body,body_html,received_at,is_read,attachments,raw_headers) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, d.account_id, d.message_id_external ?? null, d.subject ?? '', d.sender ?? '', d.recipient ?? '', d.body ?? null, d.body_html ?? null, d.received_at ?? new Date().toISOString(), d.is_read ?? 0, d.attachments ?? '{}', d.raw_headers ?? null]); this.save(); return this.getMessageById(id)!;
  }
  getMessageById(id: string): Message | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM messages WHERE id=?`, [id]); return r.length ? rowToMessage(r[0].values[0]) : null; }
  getMessagesByAccount(accountId: string): Message[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM messages WHERE account_id=? ORDER BY received_at DESC`, [accountId]); return r[0]?.values.map(rowToMessage) ?? []; }
  getMessagesByIdentity(identityId: string): Message[] { this.ensureInit(); const r = this.db!.exec(`SELECT m.* FROM messages m JOIN email_accounts ea ON m.account_id=ea.id WHERE ea.identity_id=? ORDER BY m.received_at DESC`, [identityId]); return r[0]?.values.map(rowToMessage) ?? []; }
  getAllMessages(): Message[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM messages ORDER BY received_at DESC`); return r[0]?.values.map(rowToMessage) ?? []; }
  markMessageRead(id: string, isRead = true): Message | null { this.ensureInit(); this.db!.run(`UPDATE messages SET is_read=? WHERE id=?`, [isRead ? 1 : 0, id]); this.save(); return this.getMessageById(id); }

  // ── Verification codes ──────────────────────────────────────────────
  createVerificationCode(d: { message_id: string; identity_id: string; sender?: string; service_label?: string | null; code: string; code_type?: string; expires_at?: string | null; notes?: string | null }): VerificationCode {
    this.ensureInit(); const id = genId();
    this.db!.run(`INSERT INTO verification_codes (id,message_id,identity_id,sender,service_label,code,code_type,received_at,expires_at,status,notes) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`,
      [id, d.message_id, d.identity_id, d.sender ?? '', d.service_label ?? null, d.code, d.code_type ?? 'otp', new Date().toISOString(), d.expires_at ?? null, d.notes ?? null]); this.save(); return this.getVerificationCodeById(id)!;
  }
  getVerificationCodeById(id: string): VerificationCode | null { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM verification_codes WHERE id=?`, [id]); return r.length ? rowToVerificationCode(r[0].values[0]) : null; }
  getVerificationCodesByMessage(msgId: string): VerificationCode[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM verification_codes WHERE message_id=?`, [msgId]); return r[0]?.values.map(rowToVerificationCode) ?? []; }
  getVerificationCodesByIdentity(identityId: string): VerificationCode[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM verification_codes WHERE identity_id=? ORDER BY received_at DESC`, [identityId]); return r[0]?.values.map(rowToVerificationCode) ?? []; }
  getAllVerificationCodes(): VerificationCode[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM verification_codes ORDER BY received_at DESC`); return r[0]?.values.map(rowToVerificationCode) ?? []; }
  getPendingVerificationCodes(): VerificationCode[] { this.ensureInit(); const r = this.db!.exec(`SELECT * FROM verification_codes WHERE status='pending' ORDER BY received_at DESC`); return r[0]?.values.map(rowToVerificationCode) ?? []; }
  markVerificationCodeUsed(id: string): VerificationCode | null { this.ensureInit(); this.db!.run(`UPDATE verification_codes SET status='used' WHERE id=?`, [id]); this.save(); return this.getVerificationCodeById(id); }
  markVerificationCodeExpired(id: string): VerificationCode | null { this.ensureInit(); this.db!.run(`UPDATE verification_codes SET status='expired' WHERE id=?`, [id]); this.save(); return this.getVerificationCodeById(id); }
}

// ─── Singleton ────────────────────────────────────────────────────────
let dbInstance: Database | null = null;
export function getDatabase(): Database { if (!dbInstance) dbInstance = new Database(); return dbInstance; }
