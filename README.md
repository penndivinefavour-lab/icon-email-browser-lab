<!-- ICON Email & Browser Lab - Project Documentation -->

## ICON Email & Browser Lab

A local-first desktop/web application for managing email identities, authorized inboxes, OTP/verification messages, browser profiles, sessions, and automated QA/testing workflows.

**Built by ICON Studios** — Penn Divine Favour

---

## Quick Start

```bash
# Install dependencies
npm install

# Run migrations and seed demo data
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

Open http://localhost:3000 to view the dashboard.

---

## Project Structure

```
ICON Email Browser Lab/
├── apps/
│   └── web/               # Vite + React web application
│       ├── index.html
│       └── src/
│           ├── main.tsx   # React entry point
│           └── App.tsx    # Main dashboard UI
├── packages/
│   ├── database/          # SQLite database layer (sql.js)
│   │   └── src/
│   │       ├── index.ts       # Database class, all CRUD operations
│   │       └── index.test.ts  # Integration tests
│   ├── email/             # Email provider adapters
│   │   └── src/
│   │       ├── index.ts       # Provider interface + implementations
│   │       └── otp-parser.ts  # OTP extraction engine
│   ├── browser/           # Playwright browser profile management
│   │   └── src/
│   │       └── index.ts
│   ├── automation/        # QA test runner
│   │   └── src/
│   │       └── index.ts
│   └── shared/            # Shared utilities
│       └── src/
│           ├── index.ts       # Re-exports all packages
│           ├── activity-logger.ts  # Activity audit logging
│           └── csv.ts          # CSV import/export
├── scripts/
│   ├── migrate.ts         # Database migrations
│   └── seed.ts            # Demo data seeding
├── data/                  # SQLite database + browser profiles
├── .env.example           # Environment template (never commit .env)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── .gitignore
```

---

## Architecture

### Stack

- **TypeScript** — type-safe application code
- **Vite** — fast development server and build tool
- **React 19** — UI components
- **sql.js** — WebAssembly SQLite (no native build required)
- **Playwright 1.62.1** — browser automation (chromium, firefox, webkit)
- **Vitest** — unit and integration testing

### Database Layer

The database package (`packages/database/src/index.ts`) provides a complete SQLite abstraction with:

- **10 migrations** covering all core entities
- **Identity management** — CRUD, search, filter, status tracking
- **Email account tracking** — provider association per identity
- **Message storage** — subject, sender, body, attachments metadata
- **Verification codes** — OTP extraction records with expiration
- **Browser profiles** — isolated profile registry
- **Sessions** — browser session lifecycle tracking
- **Test runs** — QA run tracking with logs and screenshots
- **Activity logs** — full audit trail
- **Settings** — key-value configuration store

### Email Provider Architecture

The email package defines a provider abstraction:

```
EmailProvider (abstract)
  ├── MockEmailProvider  — local testing, pre-populated demo messages
  ├── IMAPProvider       — IMAP/SMTP (not yet implemented)
  ├── GmailProvider      — Gmail API / OAuth2 (not yet implemented)
  └── OutlookProvider    — Microsoft Graph (not yet implemented)
```

Each provider is created via `createProvider(config, accountId, identityId)`.

The `MockEmailProvider` includes a `addMessage()` method for injecting test messages and `clearMessages()` for reset.

### OTP Parser

The OTP parser (`packages/email/src/otp-parser.ts`) detects verification codes using configurable regex patterns:

- 6-digit codes: `123456`
- 6-digit with spaces: `123 456`
- 6-digit with dashes: `123-456`
- Pattern-context: "your code is: 123456"
- Service label extraction
- Expiration detection

Default config is in `defaultOTPConfig`. Custom configs can be passed to `getOTPParser(config)`.

---

## Core Entities

### Identity

```
id                TEXT PRIMARY KEY
email             TEXT UNIQUE NOT NULL
display_name      TEXT
provider          TEXT NOT NULL DEFAULT 'unknown'
status            TEXT NOT NULL DEFAULT 'available'
tags              TEXT NOT NULL DEFAULT '[]'
notes             TEXT
created_at        TEXT DEFAULT datetime('now')
last_used_at      TEXT
browser_profile_id TEXT FK -> browser_profiles(id)
verification_status TEXT NOT NULL DEFAULT 'unverified'
source            TEXT NOT NULL DEFAULT 'manual'
metadata          TEXT NOT NULL DEFAULT '{}'
```

Statuses: `available`, `assigned`, `used`, `disabled`, `verification pending`, `verified`, `error`

### Email Account

```
id              TEXT PRIMARY KEY
identity_id     TEXT UNIQUE FK -> identities(id) ON DELETE CASCADE
provider_type   TEXT NOT NULL
config          TEXT NOT NULL DEFAULT '{}'
is_active       INTEGER NOT NULL DEFAULT 1
created_at      TEXT DEFAULT datetime('now')
last_synced_at  TEXT
```

### Message

```
id                  TEXT PRIMARY KEY
account_id          TEXT NOT NULL FK -> email_accounts(id) ON DELETE CASCADE
message_id_external TEXT
subject             TEXT NOT NULL DEFAULT ''
sender              TEXT NOT NULL DEFAULT ''
recipient           TEXT NOT NULL DEFAULT ''
body                TEXT
body_html           TEXT
received_at         TEXT DEFAULT datetime('now')
is_read             INTEGER NOT NULL DEFAULT 0
attachments         TEXT NOT NULL DEFAULT '[]'
raw_headers         TEXT
```

### Verification Code

```
id            TEXT PRIMARY KEY
message_id    TEXT UNIQUE FK -> messages(id) ON DELETE CASCADE
identity_id   TEXT NOT NULL FK -> identities(id) ON DELETE CASCADE
sender        TEXT NOT NULL DEFAULT ''
service_label TEXT
code          TEXT NOT NULL
code_type     TEXT NOT NULL DEFAULT 'otp'
received_at   TEXT DEFAULT datetime('now')
expires_at    TEXT
status        TEXT NOT NULL DEFAULT 'detected'
notes         TEXT
```

Statuses: `detected`, `used`, `expired`, `invalid`, `pending`

### Browser Profile

```
id            TEXT PRIMARY KEY
name          TEXT NOT NULL
browser       TEXT NOT NULL DEFAULT 'chromium'
directory     TEXT NOT NULL
identity_id   TEXT FK -> identities(id) ON DELETE SET NULL
status        TEXT NOT NULL DEFAULT 'inactive'
created_at    TEXT DEFAULT datetime('now')
last_launched_at TEXT
last_closed_at   TEXT
notes         TEXT
```

### Session

```
id            TEXT PRIMARY KEY
profile_id    TEXT NOT NULL FK -> browser_profiles(id) ON DELETE CASCADE
identity_id   TEXT FK -> identities(id) ON DELETE SET NULL
started_at    TEXT DEFAULT datetime('now')
ended_at      TEXT
duration_ms   INTEGER
status        TEXT NOT NULL DEFAULT 'active'
test_run_id   TEXT FK -> test_runs(id) ON DELETE SET NULL
notes         TEXT
```

Statuses: `active`, `completed`, `failed`, `terminated`

### Test Run

```
id                 TEXT PRIMARY KEY
name               TEXT NOT NULL
target_environment TEXT NOT NULL DEFAULT 'local'
profile_id         TEXT FK -> browser_profiles(id) ON DELETE SET NULL
identity_id        TEXT FK -> identities(id) ON DELETE SET NULL
started_at         TEXT
ended_at           TEXT
status             TEXT NOT NULL DEFAULT 'queued'
logs               TEXT NOT NULL DEFAULT '[]'
screenshots        TEXT NOT NULL DEFAULT '[]'
result             TEXT
```

Statuses: `queued`, `running`, `passed`, `failed`, `cancelled`

### Activity Log

```
id          TEXT PRIMARY KEY
timestamp   TEXT DEFAULT datetime('now')
action      TEXT NOT NULL
entity      TEXT NOT NULL
entity_id   TEXT NOT NULL
actor       TEXT NOT NULL DEFAULT 'system'
result      TEXT NOT NULL DEFAULT 'success'
details     TEXT NOT NULL DEFAULT '{}'
```

---

## Commands

```bash
# Development
npm run dev              # Start Vite dev server

# Database
npm run db:migrate       # Run pending migrations
npm run db:seed          # Seed demo data (skipped if data exists)

# Testing
npm run test             # Run all tests (Vitest)
npm run test:watch       # Watch mode
npm run test:e2e         # Playwright E2E tests (placeholder)

# Code quality
npm run lint             # ESLint
npm run format           # Prettier
```

---

## Provider Configuration

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Configure email providers in `.env`:

```
# IMAP
IMAP_HOST=
IMAP_PORT=993
IMAP_USER=
IMAP_PASS=

# Gmail (OAuth2)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=

# Outlook
OUTLOOK_HOST=
OUTLOOK_USER=
OUTLOOK_PASS=
```

**Security**: `.env` is git-ignored. Never commit credentials.

---

## Browser Automation

The browser package uses Playwright for isolated browser profiles:

```typescript
import { getBrowserProfileManager } from '../packages/browser/src/index';

const manager = getBrowserProfileManager();

// Create a profile
const profile = manager.createProfile({
  id: 'my-profile',
  name: 'QA Testing',
  browser: 'chromium',
  directory: './data/browser-profiles/my-profile',
});

// Launch
const session = await manager.launchProfile('my-profile', {
  headless: false,
  slowMo: 100,
});

// Navigate
await manager.navigate('my-profile', 'http://localhost:3000');

// Screenshot
await manager.takeScreenshot('my-profile', './data/screenshot.png');

// Close
await manager.closeSession('my-profile');
```

Each profile has its own storage directory with isolated cookies, localStorage, and sessionStorage.

---

## Testing

### Test Suite Coverage

- **Identity CRUD** — create, read, update, delete, unique constraint
- **Identity filtering** — by status, provider, search
- **Identity search** — by email, display name, notes
- **CSV import/export** — export, parse, test generation
- **Email accounts** — create, retrieve by identity
- **Messages** — create, list, mark read, search
- **Verification codes** — create, update status, list by identity
- **Browser profiles** — create, list, update, delete
- **Sessions** — create, end, list active
- **Test runs** — create, update status, add logs, list
- **Activity logs** — create, recent, filter by action
- **Settings** — set, get, list all

Run tests:

```bash
npm run test
```

---

## Mock Email System

The mock provider is the default email provider for testing. It includes:

- **Pre-populated demo messages** (when configured with delay)
- **`addMessage()`** — inject custom test messages
- **`clearMessages()`** — reset state
- **`connect()` / `disconnect()`** — simulated with optional delay

Seeded demo messages include an OTP code (847291) and a verification code (392847).

---

## Known Limitations

1. **Playwright browsers not pre-installed** — `PLAYWRIGHT_INSTALL_BROWSERS=false` by default; install manually when needed
2. **IMAP/Gmail/Outlook adapters** — stub implementations only, not yet functional
3. **No CAPTCHA/stealth features** — by design; this is a legitimate QA tool
4. **No Tauri desktop wrapper yet** — currently a Vite web app that runs in a browser
5. **sql.js in-memory** — database loads from disk on init and saves on write; no background persistence
6. **HTTPS/localhost test website** — not yet built; QA tests use simulated flows

---

## Future Work

- [ ] Tauri desktop wrapper for native app experience
- [ ] IMAP provider implementation
- [ ] Gmail OAuth2 provider
- [ ] Local test website for QA flows
- [ ] Real Playwright test execution in UI
- [ ] OTP auto-extraction from incoming mock messages
- [ ] Session recording and playback
- [ ] Advanced filtering and bulk operations
- [ ] Multi-account inbox aggregation
- [ ] Export to PDF/HTML reports
- [ ] Dark/light theme toggle

---

## License

MIT — ICON Studios 2026
