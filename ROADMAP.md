# ICON Email & Browser Lab — Roadmap

## Vision

A local-first desktop application for developers, QA engineers, and researchers to manage email identities, authorized inboxes, OTP flows, browser profiles, and automated testing — all with ICON Studios' premium design standard.

---

## Done (Phase 1-5)

- [x] Project initialization (npm, TypeScript, Vite, vitest)
- [x] SQLite database layer with sql.js (10 migrations)
- [x] Full identity CRUD with search/filter
- [x] Email account tracking
- [x] Message storage with read/unread
- [x] OTP verification code tracking
- [x] Browser profile registry
- [x] Session lifecycle tracking
- [x] Test run management with logs
- [x] Activity audit logging
- [x] Settings key-value store
- [x] Mock email provider (fully functional)
- [x] OTP parser with configurable patterns
- [x] Browser profile manager (Playwright integration, persistent contexts)
- [x] Test runner with 5 built-in test cases + Phase 5 isolation tests
- [x] CSV import/export utilities
- [x] Test identity generation for QA
- [x] Activity logger with structured events
- [x] Integration test suite (30+ tests)
- [x] ICON-branded dashboard UI (React + dark theme)
- [x] All 9 dashboard modules wired
- [x] Environment configuration (.env.example)
- [x] Documentation (README, ARCHITECTURE, DEVELOPMENT, SECURITY)
- [x] React key prop warning fix (TableRow children refactor)
- [x] Vite dev server path alias resolution
- [x] Local test fixture page for isolation testing
- [x] Playwright browser isolation test suite (6 tests)
- [x] Phase 5: Cross-profile localStorage isolation (verified)
- [x] Phase 5: Cross-profile cookie isolation (verified)
- [x] Phase 5: Cross-profile sessionStorage isolation (verified)
- [x] Phase 5: Persistence within profile after close/reopen (verified)
- [x] Phase 5: Full lifecycle — create, launch, use, close, reopen, delete (verified)
- [x] Phase 5: Multiple simultaneous isolated profiles (verified — 3 profiles)

---

## In Progress (Phase 3-5)

### Phase 3: UI Completion

- [ ] Settings panel — interactive configuration forms
- [ ] Import modal — CSV file upload with preview
- [ ] Identity detail view — full edit form
- [ ] Message composing (for mock provider)
- [ ] OTP code copy-to-clipboard
- [ ] Profile launch UI (integrated Playwright)
- [ ] Test run execution from UI
- [ ] Better empty states with action prompts
- [ ] Keyboard navigation improvements

### Phase 4: Mock Email System

- [ ] Message generation from templates
- [ ] OTP auto-extraction when messages arrive
- [ ] Message threading / conversation view
- [ ] Attachment metadata display
- [ ] Email search with highlighting

### Phase 5: Browser Laboratory

- [ ] Local test website (simple login + verification flow)
- [ ] Integrated Playwright browser launching from UI
- [ ] Screenshot capture and viewing
- [ ] Session recording
- [ ] Profile isolation verification tests

---

## Future (Phase 6-8)

### Phase 6: Provider Adapters

- [ ] IMAP provider (node-imap or imapflow)
- [ ] Gmail OAuth2 provider
- [ ] Microsoft Graph / Outlook provider
- [ ] Provider health monitoring
- [ ] Credential validation on save
- [ ] Connection test button

### Phase 7: Polish

- [ ] Tauri desktop wrapper
- [ ] Dark/light theme toggle
- [ ] Data export to PDF/HTML reports
- [ ] Bulk identity operations (assign, mark used, delete)
- [ ] Advanced filtering (date range, multiple statuses)
- [ ] Activity log export
- [ ] Keyboard shortcuts documentation
- [ ] Accessibility improvements (ARIA labels, focus management)
- [ ] Responsive refinements for smaller windows

### Phase 8: Release

- [ ] Production build validation
- [ ] Complete test report
- [ ] Screenshots and demos
- [ ] GitHub release with changelog
- [ ] Optional: NSIS/WiX installer for Windows
- [ ] Optional: packaged executable via Tauri

---

## Known Constraints

1. **No native build tools**: MSBuild/VS Build Tools not available, so `better-sqlite3` cannot compile. Using `sql.js` (WASM) instead — no native compilation needed.

2. **Playwright browsers**: Not pre-installed. Must run `npx playwright install` or set `PLAYWRIGHT_INSTALL_BROWSERS=true`.

3. **No local test website yet**: QA tests currently use simulated flows. A real test website is needed for full E2E validation.

4. **No Tauri yet**: Application runs as a Vite web app. Desktop wrapping is a future phase.

---

## Priorities

| Priority | Item | Reason |
|----------|------|--------|
| P0 | Fix any test failures | Tests must pass before claiming functionality |
| P0 | Get Playwright browsers installed | Needed for browser lab phase |
| P1 | Build local test website | Enables real E2E testing |
| P1 | Settings UI | Completes the settings module |
| P2 | IMAP provider | Most requested real provider |
| P2 | Tauri wrapper | Desktop app experience |
| P3 | Gmail/Outlook providers | Depends on OAuth setup |
| P3 | Advanced bulk operations | Power-user feature |

---

## Version History

### v1.0.0 (Current)

- Initial release
- SQLite database with 10 migrations
- 9 dashboard modules
- Mock email provider
- OTP parser
- Browser profile manager
- Test runner with 5 test cases
- Integration test suite
- ICON Studios branding

---

## How to Contribute

This is a solo ICON Studios project. All development is done by Penn Divine Favour.

To propose changes:

1. Fork the repo
2. Create a feature branch
3. Implement with tests
4. Submit a pull request

All contributions must align with the security principles documented in SECURITY.md.
