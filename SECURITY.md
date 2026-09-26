# ICON Email & Browser Lab — Security

## Security Principles

ICON Email & Browser Lab is designed as a **local-first** tool for authorized account management, QA, and testing. Security is centered on protecting sensitive credentials and maintaining transparency about what the tool does and does not do.

---

## What This Tool Is NOT

This tool is **NOT**:

- A CAPTCHA bypass system
- A phone verification bypass tool
- An anti-detection or fingerprint spoofing mechanism
- An automated mass-account creation tool
- A service that intercepts third-party OTPs without authorization
- A tool for violating third-party Terms of Service

Any use of this tool to bypass authentication, verification, or rate-limiting systems of third-party services is outside its intended purpose and is the user's responsibility.

---

## Credential Handling

### Environment Variables

All provider credentials are stored in `.env` (git-ignored). The application reads from environment variables at runtime.

```env
# .env (git-ignored — NEVER commit)
IMAP_PASS=your-password-here
GMAIL_CLIENT_SECRET=your-secret-here
```

The `.env.example` template documents the required variables without containing real values.

### Local Storage

Credentials are stored in the database `email_accounts.config` field as JSON. This is local-only storage. The database file (`data/icon-lab.db`) should be treated as containing sensitive data:

- Back up with care
- Do not share the database file
- Encrypt the disk if the machine is portable

### Logging

The activity log records actions but **never** records:

- Passwords
- Access tokens
- Full credential objects
- Sensitive message body content beyond what's needed for OTP extraction

Log entries contain action type, entity, entity ID, actor, result, and minimal details.

---

## Browser Profile Security

### Isolation

Each browser profile is a separate Playwright `BrowserContext` with its own:

- Cookies
- localStorage
- sessionStorage
- IndexedDB

Profiles do not share state. This prevents cross-contamination between test identities.

### No Anti-Detection

The tool does **NOT**:

- Spoof user agents beyond what Playwright provides by default
- Modify navigator.webdriver flags
- Use stealth plugins
- Implement canvas/WebGL fingerprinting randomization
- Bypass bot detection

Browser profiles are for legitimate QA testing, not for evading platform enforcement.

---

## Network Security

### Local-First

The application runs entirely locally with no cloud dependency for core functionality:

- Database is local SQLite file
- Browser profiles are local directories
- Mock email provider requires no network

When real providers are configured (IMAP, Gmail, Outlook), network access is required for those specific features only.

### No Telemetry

The application does not send usage data, crash reports, or analytics to any external service.

---

## Secure Development Practices

### Dependencies

- Pin dependency versions in `package.json`
- Review `npm audit` output before releases
- Do not introduce dependencies without review

### Secrets in Code

- No hardcoded credentials
- No example files with real secrets
- `.env` is in `.gitignore`
- `.env.example` contains only placeholder values

### Input Validation

- Email addresses are validated as unique via database constraint
- CSV import validates required fields
- OTP parser validates code format before accepting

---

## Data Protection

### Database File

The SQLite database (`data/icon-lab.db`) contains:

- Email addresses
- Provider configuration (may include passwords in encrypted or plain form depending on provider)
- OTP codes (temporarily)
- Activity logs

Protect this file appropriately:

```bash
# Example: restrict permissions (Unix)
chmod 600 data/icon-lab.db

# Example: encrypt the data directory
# Use BitLocker (Windows) or equivalent
```

### Backup

Back up the database file before major changes. The file is a single SQLite database — copying it creates a complete backup.

### Cleanup

When removing identities or profiles, related data is cascade-deleted via foreign key constraints:

- Deleting an identity cascades to its email account
- Deleting an email account cascades to its messages
- Deleting a message cascades to its verification codes
- Deleting a browser profile cascades to its sessions

---

## Responsible Use

### Authorized Use Cases

- Managing email identities for development and testing
- Testing OTP flows on accounts you control
- Running QA workflows on local test environments
- Organizing authorized inboxes for research

### Unauthorized Use Cases (Prohibited)

- Creating accounts on third-party services in violation of their ToS
- Bypassing phone verification or CAPTCHA
- Automating mass registration
- Intercepting OTPs for accounts you do not control
- Evading rate limits or anti-abuse systems

---

## Security Updates

When security-relevant changes are made:

1. Update `SECURITY.md` with the change
2. Note the version in `README.md`
3. Document in `CHANGELOG.md` (to be created when needed)

---

## Reporting Security Issues

For security issues related to this codebase, review the code directly. The application is open-source (MIT license) and local-run — there is no remote attack surface beyond what you configure (provider credentials, network access for IMAP/Gmail/Outlook).
