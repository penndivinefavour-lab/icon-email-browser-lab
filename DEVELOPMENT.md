# ICON Email & Browser Lab — Development Guide

## Setup

### Prerequisites

- Node.js 20+ (tested with v24.19.0)
- npm 11+ (tested with 11.17.0)
- Git 2.55+
- (Optional) Playwright browsers installed: `npx playwright install`

### Clone & Install

```bash
git clone https://github.com/penndivinefavour-lab/icon-email-browser-lab.git
cd icon-email-browser-lab
npm install
```

### First Run

```bash
# Copy environment template
cp .env.example .env

# Run database migrations
npm run db:migrate

# Seed demo data
npm run db:seed

# Start development server
npm run dev
```

The app opens at http://localhost:3000.

---

## Project Structure

```
D:\
└── Hermes Agent\
    └── ICON Email Browser Lab\
        ├── apps\web\              # React + Vite frontend
        │   ├── index.html
        │   └── src\
        │       ├── main.tsx       # React entry
        │       └── App.tsx        # Full dashboard UI
        ├── packages\
        │   ├── database\          # SQLite layer (sql.js)
        │   │   └── src\
        │   │       ├── index.ts       # Database class
        │   │       └── index.test.ts  # Integration tests
        │   ├── email\             # Provider adapters + OTP
        │   │   └── src\
        │   │       ├── index.ts       # Providers
        │   │       └── otp-parser.ts  # OTP engine
        │   ├── browser\           # Playwright profiles
        │   │   └── src\
        │   │       └── index.ts
        │   ├── automation\        # QA test runner
        │   │   └── src\
        │   │       └── index.ts
        │   └── shared\            # Re-exports + utils
        │       └── src\
        │           ├── index.ts
        │           ├── activity-logger.ts
        │           └── csv.ts
        ├── scripts\
        │   ├── migrate.ts         # Migration runner
        │   └── seed.ts            # Demo seed
        ├── data\                  # SQLite DB + profiles
        ├── .env.example
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts
        ├── vitest.config.ts
        ├── README.md
        ├── ARCHITECTURE.md
        ├── DEVELOPMENT.md
        ├── SECURITY.md
        └── ROADMAP.md
```

---

## Commands

### Development

```bash
npm run dev          # Vite dev server (http://localhost:3000)
npm run lint         # ESLint check
npm run format       # Prettier format
```

### Database

```bash
npm run db:migrate   # Run all pending migrations (idempotent)
npm run db:seed      # Seed demo data (skipped if data exists)
```

Both scripts use `tsx` to run TypeScript directly without compilation.

### Testing

```bash
npm run test              # Run all tests once
npm run test:watch        # Run tests in watch mode
npm run test:e2e          # Playwright E2E (placeholder)
```

Tests are written with Vitest in `packages/database/src/index.test.ts`. They cover:

- Identity CRUD (create, read, update, delete, unique constraint)
- Identity filtering (status, provider, search, combined)
- Identity search (email, display name, notes)
- CSV import/export (export, parse, generate)
- Email accounts (create, retrieve)
- Messages (create, list, mark read, search)
- Verification codes (create, update status, list by identity)
- Browser profiles (create, list, update, delete)
- Sessions (create, end, list active)
- Test runs (create, update status, add logs, list)
- Activity logs (create, recent, filter by action)
- Settings (set, get, list all)

### Browser Automation

```bash
# Install Playwright browsers (one-time)
npx playwright install chromium firefox webkit

# Or set in .env:
# PLAYWRIGHT_INSTALL_BROWSERS=true
```

---

## Database Migrations

Migrations are defined in `packages/database/src/index.ts` inside the `runMigrations()` method. They run automatically on `db.initialize()`. Migrations are idempotent — safe to run multiple times.

Current migrations:

| Migration | Table |
|-----------|-------|
| 001_identities | `identities` |
| 002_email_accounts | `email_accounts` |
| 003_messages | `messages` |
| 004_verification_codes | `verification_codes` |
| 005_browser_profiles | `browser_profiles` |
| 006_sessions | `sessions` |
| 007_test_runs | `test_runs` |
| 008_test_artifacts | `test_artifacts` |
| 009_activity_logs | `activity_logs` |
| 010_settings | `settings` |

To add a migration, add a new entry to the `migrations` array with a unique name and SQL.

---

## Testing Strategy

### Unit Tests (Vitest)

Located in `packages/database/src/index.test.ts`. Each test group is isolated using `beforeEach` to clear test data.

Run:
```bash
npm run test
```

### End-to-End Tests (Playwright)

Placeholder at `tests/e2e/` — to be implemented when the local test website is available.

---

## Provider Configuration

### Mock Provider (Default)

No configuration needed. Used automatically when `provider_type: 'mock'`.

### IMAP

```env
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_USER=user@example.com
IMAP_PASS=your-password
```

### Gmail (OAuth2)

```env
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
```

### Outlook / Microsoft 365

```env
OUTLOOK_HOST=outlook.office365.com
OUTLOOK_USER=user@domain.com
OUTLOOK_PASS=your-password
```

---

## Browser Profiles

Browser profiles are stored in `data/browser-profiles/<profile-id>/`. Each profile has:

- `storage.json` — Playwright storage state (cookies, localStorage)
- Profile-specific browser data

Create a profile via the UI (Profiles tab → Create Profile) or programmatically:

```typescript
import { getBrowserProfileManager } from '../packages/browser/src/index';

const mgr = getBrowserProfileManager();
const profile = mgr.createProfile({
  id: 'test-profile',
  name: 'QA Chrome',
  browser: 'chromium',
  directory: './data/browser-profiles/test-profile',
});
```

---

## Running the Application

### Development Mode

```bash
npm run dev
```

Opens Vite dev server at http://localhost:3000. Hot reload enabled.

### Production Build

```bash
npm run build
```

Output in `dist/web/`. Serve with any static server:

```bash
npx serve dist/web
```

### As a Desktop App (Future)

The application is designed to be wrapped with Tauri for a native desktop experience. The UI is already desktop-first and responsive.

---

## Troubleshooting

### Migration errors

Delete `data/icon-lab.db` and re-run `npm run db:migrate`.

### Port already in use

Change `APP_PORT` in `.env`.

### Playwright browser not found

Run `npx playwright install chromium` or set `PLAYWRIGHT_INSTALL_BROWSERS=true` in `.env`.

### Database not initializing

Ensure `DATABASE_PATH` in `.env` points to a writable location. Default is `./data/icon-lab.db`.

---

## IDE Setup

### VS Code

Extensions recommended:
- ESLint
- Prettier
- TypeScript + Vue Language Features (Volar)

Settings are not committed (see `.gitignore`).

### Keyboard Shortcuts

The dashboard supports:
- Tab navigation between sections
- Enter to submit forms
- Escape to close modals
- Copy-to-clipboard for emails

---

## Security Notes

- `.env` is git-ignored. Never commit secrets.
- Passwords are never logged.
- Provider credentials are stored in config fields as JSON — treat as sensitive.
- The application is local-first; no data leaves the machine unless you configure a provider.
