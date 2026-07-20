# MVP AI Job Hunter (RU Market) — p4rs3r

A CLI-driven, safety-first job automation tool for React, TypeScript, and Node.js developers in the Russian IT market (targeting `hh.ru`, `Habr Career`, and `FL.ru`). Built with zero UI, SQLite persistence, Zod validation, deterministic policy filtering, and complete offline fixture testing.

---

## 1. Quick Start & Setup

### Requirements
- Node.js v22+
- npm v10+

### Installation & Build
```bash
# Install dependencies
npm install

# Build TypeScript code
npm run build

# Run unit & acceptance test suite
npm test

# Initialize database and verify config
npm run setup

# Check HH browser session auth status
npm run auth-status -- --source hh

# Run scan on fixture or live HH source
npm run scan -- --source fixture
npm run scan -- --source hh --query "React TypeScript" --pages 1 --limit 10

# Run deterministic policy filter (No LLM)
npm run filter

# Run candidate interactive human review
npm run review -- --source hh

# Generate daily Markdown and JSON reports
npm run report -- --source hh
```

---

## 2. Verified Command Pipeline Matrix

| Command | Status | Verified Output |
|---|---|---|
| `npm install` | ✅ Working | Clean install without missing dependencies |
| `npm run build` | ✅ Working | Compiles clean TypeScript to `./dist` |
| `npm test` | ✅ Working | 21/21 passing tests across 9 test suites |
| `npm run setup` | ✅ Working | Idempotent SQLite DDL initialization (`jobs.db`) |
| `npm run auth-status -- --source hh` | ✅ Working | Verifies persistent Chromium session state (`not_authenticated`, `authenticated`, `blocked`) |
| `npm run scan -- --source hh` | ✅ Working | Harvests vacancies via official public API with pagination, rate limiting, and Zod validation |
| `npm run filter` | ✅ Working | Evaluates deterministic policy rules (seniority, remote, salary, no-go phrases) without LLM |
| `npm run review -- --source hh` | ✅ Working | Candidate review CLI with `open`, `skip`, `mark-for-apply`, `export` actions |
| `npm run apply -- --mode dry-run` | ✅ Working | Simulates application, preserves DB status, isolates applier |
| `npm run apply -- --mode auto` | ⛔ Guarded | Disabled in Phase 2 (`REAL_SUBMIT_ENABLED=false`). Direct submit disabled for safety. |
| `npm run report -- --source hh` | ✅ Working | Renders daily Markdown (`reports/YYYY-MM-DD.md`) and JSON (`reports/YYYY-MM-DD.json`) reports |

---

## 3. Operational Capability Matrix

| Mode / Feature | Offline / Fixture | Live Network | Auth Required | Status |
|---|---|---|---|---|
| **Fixture Source** | ✅ Supported | N/A | No | Fully tested (6 edge-case vacancies) |
| **HH.ru Search & Details** | N/A | ✅ Supported | No | Official API (`api.hh.ru/vacancies`) |
| **HH.ru Manual Login** | N/A | ✅ Supported | Yes | Persistent profile context (`.browser_data/hh_profile`) |
| **HH.ru Application Submit**| ⛔ Disabled | ⛔ Disabled | Yes | `REAL_SUBMIT_ENABLED=false` (Human review & export only) |
| **Habr Career** | N/A | ✅ Supported | No | Web adapter |
| **FL.ru RSS** | N/A | ✅ Supported | No | Public RSS XML feed |
| **Avito** | ❌ Disabled | ❌ Disabled | N/A | `unsupported_for_candidate_flow` |

---

## 4. Security, Safety & Threat Model

1. **Zero Credential Storage**: Passwords, 2FA codes, cookies, and session tokens are never requested or stored in code, logs, `.env`, or Git repository. Candidate logs in manually in Playwright browser.
2. **Disabled Real Submit Guard**: `REAL_SUBMIT_ENABLED=false` compile/runtime gate prevents direct application submission or clicking submit buttons in Phase 2.
3. **No Stealth / Anti-Bot Bypass**: Automation uses standard browser profile without anti-detect or CAPTCHA solvers. Halts immediately on 403, 429, or CAPTCHA.
4. **Deterministic Policy Filter**: No-go keywords, seniority mismatches, and format constraints are filtered deterministically prior to any LLM scoring. Unspecified salary moves item to `needs_review` / neutral rather than reject.
