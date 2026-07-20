# Project Status — MVP AI Job Hunter (p4rs3r)

**Date:** 2026-07-20  
**Phase:** Phase 2 Real HH Harvest, Manual Auth & Review Flow Implemented

| Feature | Implemented | Tested | Broken | Next Action / Notes |
|---|---|---|---|---|
| **SQLite DB Schema & Repositories** | Yes | Yes | None | Extended with `area_id`, `company_url`, `schedule`, `experience`, `alternate_url`, `raw_payload_path`, `source_metadata`, `filter_reasons` |
| **Manual Browser Login & Profile** | Yes | Yes | None | Interactive login with `chromium.launchPersistentContext` saved in `.browser_data/hh_profile` |
| **Auth Status Checker (`auth-status`)**| Yes | Yes | None | Headless session status checker (`authenticated`, `not_authenticated`, `blocked`, `unknown`) |
| **HH.ru Real Search & Details API** | Yes | Yes | None | Official `api.hh.ru/vacancies` client with `User-Agent`, `AbortController` timeout, Zod parsing, and 5xx retries |
| **Raw Payload Archiving** | Yes | Yes | None | Sanitized raw payloads saved to `data/raw/hh/YYYY-MM-DD/` with SHA-256 hash |
| **URL Canonicalization** | Yes | Yes | None | Strips `from`, `hhtmFrom`, `utm_*` tracking params while preserving vacancy ID |
| **Deduplication & Idempotency** | Yes | Yes | None | Unique constraint on `(source, external_id)` and `canonical_url`. Updates existing records without deleting history |
| **Deterministic Policy Filter (`filter`)**| Yes | Yes | None | Filters no-go phrases, seniority mismatch, and remote format without LLM. Missing salary -> `needs_review` |
| **Human Review CLI (`review`)** | Yes | Yes | None | Interactive review with `open`, `skip`, `mark-for-apply`, and `export` options |
| **Report Generator (`report`)** | Yes | Yes | None | Renders daily Markdown (`reports/YYYY-MM-DD.md`) and JSON (`reports/YYYY-MM-DD.json`) reports with zero-submit confirmation |
| **Real Submit Safety Guard** | Yes | Yes | None | `REAL_SUBMIT_ENABLED=false` compile & runtime gate blocks direct submission in Phase 2 |
| **Acceptance & Unit Test Suite** | Yes | Yes | None | 21/21 passing Vitest tests across 9 test suites |
