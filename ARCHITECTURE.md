# ICON Email & Browser Lab — Architecture

## Overview

ICON Email & Browser Lab is a local-first desktop/web application built on a modular TypeScript architecture. The system is organized as a monorepo-style workspace with clearly separated packages for database, email providers, browser automation, and automation/QA.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    WEB UI (React + Vite)                │
│  Dashboard │ Identities │ Inbox │ OTP │ Profiles │ ...  │
└─────────────┬───────────────────────────────────────────┘
              │
┌─────────────┼───────────────────────────────────────────┐
│             │           PACKAGE LAYER                    │
│  ┌──────────▼──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │    Database Layer   │  │  Email   │  │  Browser    │ │
│  │    (sql.js / SQLite)│  │  Adapters│  │  Playwright │ │
│  └─────────────────────┘  └──────────┘  └─────────────┘ │
│  ┌─────────────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │   Shared Utilities  │  │  OTP     │  │  Automation │ │
│  │   (CSV, ActivityLog)│  │  Parser  │  │  Test Runner│ │
│  └─────────────────────┘  └──────────┘  └─────────────┘ │
└─────────────┬───────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────┐
│                  LOCAL STORAGE                          │
│  ├── data/icon-lab.db         (SQLite database)        │
│  ├── data/browser-profiles/   (isolated profile dirs)  │
│  ├── data/test-screenshots/   (test artifacts)         │
│  └── .env                     (secrets — git-ignored)  │
└─────────────────────────────────────────────────────────┘
```

---

## Package Boundaries

### `packages/database`

**Responsibility**: All persistence. One database class owns SQLite connection, migrations, and all CRUD operations. No other package directly touches SQL.

**Public API**: `Database` class with typed methods:
- `initialize()` / `close()` / `save()`
- Identity: `createIdentity`, `getIdentityById`, `getAllIdentities`, `updateIdentity`, `deleteIdentity`, `searchIdentities`, `filterIdentities`
- Email: `createEmailAccount`, `getEmailAccountById`, `getEmailAccountByIdentityId`
- Messages: `createMessage`, `getMessageById`, `getMessagesByAccount`, `markMessageRead`, `searchMessages`
- Verification: `createVerificationCode`, `getVerificationCodeById`, `getVerificationCodesByIdentity`, `updateVerificationCodeStatus`
- Profiles: `createBrowserProfile`, `getBrowserProfileById`, `getAllBrowserProfiles`, `updateBrowserProfile`, `deleteBrowserProfile`
- Sessions: `createSession`, `getSessionById`, `getSessionsByProfile`, `getActiveSessions`, `endSession`
- Test Runs: `createTestRun`, `getTestRunById`, `getAllTestRuns`, `updateTestRunStatus`, `addTestRunLog`
- Activity: `createActivityLog`, `getActivityLogById`, `getRecentActivityLogs`, `getActivityLogsByAction`
- Settings: `getSetting`, `setSetting`, `getAllSettings`

### `packages/email`

**Responsibility**: Email provider abstraction and OTP parsing. Defines the `EmailProvider` interface and concrete implementations.

**Public API**:
- `EmailProvider` (abstract class) — connect, disconnect, fetchMessages, searchMessages, markAsRead, getUnreadCount
- `createProvider(config, accountId, identityId)` — factory
- `MockEmailProvider` — local testing with `addMessage()` and `clearMessages()`
- `OTPParser` — configurable regex-based OTP detection
- `getOTPParser(config?)` — singleton accessor

### `packages/browser`

**Responsibility**: Isolated browser profile management via Playwright.

**Public API**:
- `BrowserProfileManager` — create, get, update, delete profiles
- `launchProfile(id, options)` — returns `BrowserSession` with context and page
- `closeSession(id)` / `closeAllSessions()`
- `navigate(sessionId, url)` / `takeScreenshot(sessionId, path)`

### `packages/automation`

**Responsibility**: Test runner with predefined test cases and execution lifecycle.

**Public API**:
- `TestRunner` — register test cases, run tests, cancel tests
- 5 built-in test cases: login-flow, email-verification, otp-extraction, profile-isolation, session-lifecycle
- `getTestRunner(config?)` — singleton accessor

### `packages/shared`

**Responsibility**: Re-exports all packages + shared utilities.

**Public API**:
- Activity logger — structured audit trail
- CSV import/export — identity bulk operations
- `generateTestIdentities(count)` — local QA identity generation

---

## Data Flow

### Identity Creation Flow

1. User creates identity in UI → `db.createIdentity()` is called
2. Database inserts row with `source: 'manual'`, `status: 'available'`
3. Activity log records `identity_created` event
4. UI refreshes to show updated list

### Email + OTP Flow

1. `MockEmailProvider.addMessage()` injects a test message
2. UI triggers OTP scan → `OTPParser.parseMessage()` extracts codes
3. Detected codes are stored via `db.createVerificationCode()`
4. Activity log records `otp_detected` event
5. OTP center displays the code with service label and expiration

### Browser Profile + Session Flow

1. User creates profile → `db.createBrowserProfile()` + `manager.createProfile()`
2. User launches profile → `manager.launchProfile()` creates Playwright context
3. Session record created via `db.createSession()`
4. Activity log records `session_started`
5. User navigates, takes screenshots, closes → `endSession()` records duration

### Test Run Flow

1. User triggers test → `runner.runTest(testCaseId, context)`
2. Test run record created with `status: 'queued'` → `status: 'running'`
3. Test executes, logs streamed via `ctx.addLog()`
4. On completion: `db.updateTestRunStatus('passed'/'failed')`
5. Activity log records `test_passed` or `test_failed`

---

## Database Schema

See `packages/database/src/index.ts` for the complete schema. All tables use:

- **TEXT primary keys** (UUID-like strings generated by `crypto.randomUUID()`)
- **Foreign key constraints** with appropriate ON DELETE behavior
- **Indexes** on frequently queried columns
- **WAL journal mode** for better concurrent access
- **Migration tracking** in `_migrations` table

---

## Extensibility

### Adding a New Email Provider

1. Extend `EmailProvider` abstract class in `packages/email/src/index.ts`
2. Implement required methods
3. Add case to `createProvider()` switch
4. Add config schema to `.env.example`

### Adding a New Test Case

```typescript
runner.registerTestCase({
  id: 'my-new-test',
  name: 'My New Test',
  description: 'Does something useful',
  type: 'custom',
  execute: async (ctx) => {
    ctx.addLog('Starting...');
    // ... test logic ...
    return 'passed';
  },
});
```

### Adding a New Database Entity

1. Add migration SQL in `packages/database/src/index.ts` inside `runMigrations()`
2. Add TypeScript interface
3. Add row mapper in the `Database` class
4. Add CRUD methods
5. Export type from shared package

---

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript 5.7 | Type safety across all layers |
| UI Framework | React 19 | Component model, ecosystem |
| Build Tool | Vite 6 | Fast dev server, simple config |
| Database | sql.js 1.11 | SQLite without native builds (no MSBuild required) |
| Browser Automation | Playwright 1.62 | Multi-browser, isolated contexts |
| Testing | Vitest 2 | Fast, Vite-native, good TypeScript support |
| ID Generation | crypto.randomUUID() | Native, no dependency |
| Environment | dotenv convention | `.env` / `.env.example` pattern |

---

## Design Decisions

1. **sql.js over better-sqlite3**: The machine lacks MSBuild/VS Build Tools, so native SQLite bindings cannot compile. sql.js (WASM) works out of the box with `--ignore-scripts`.

2. **Single database file**: All data in one SQLite file at `data/icon-lab.db`. Simple backup (copy the file), easy migration.

3. **In-memory with periodic save**: sql.js keeps data in memory; `save()` writes to disk on each mutation. Trade-off: no crash recovery for in-flight writes, but fast and simple.

4. **No ORM**: Direct SQL via sql.js API. Schema is small enough that an ORM adds complexity without benefit.

5. **Mock-first**: The system is fully functional with `MockEmailProvider`. Real providers are added later, only after local system is verified.

6. **Playwright contexts for isolation**: Each browser profile gets its own `BrowserContext`, giving cookie/localStorage isolation without needing separate browser instances.
