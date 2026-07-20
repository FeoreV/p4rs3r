# RESEARCH.md — Job Hunter MVP API & Source Feasibility Matrix

**Date:** 2026-07-20  
**Project:** MVP AI Job Hunter (RU Market)

---

## 1. HeadHunter (hh.ru) — P0 Source

### API Endpoints
* **Vacancies Search:** `GET https://api.hh.ru/vacancies`
  * **Headers:** `User-Agent: AI-Job-Hunter/1.0 (contact@example.com)` (Mandatory, otherwise `400 Bad Request`).
  * **Query Params:** `text` (search keywords), `area` (1 = Moscow, 2 = Saint Petersburg, 113 = Russia), `salary`, `employment`, `schedule` (`remote`), `experience` (`noExperience`, `between1And3`), `page`, `per_page` (max 100).
* **Vacancy Details:** `GET https://api.hh.ru/vacancies/{id}`
  * Returns full HTML/text description, key skills, salary bounds, employer info, and application schema/questions.

### Application Flow
* **Official API Apply:** Requires OAuth candidate authorization and application approval scope.
* **Playwright Context Flow:**
  * Uses persistent browser context stored in `.browser_data/` (git-ignored).
  * Manual initial login via `npm run login -- --source hh`.
  * Modes:
    * `dry-run`: Renders filled draft without submission.
    * `review`: Pre-fills application form, takes screenshot, halts for user confirmation.
    * `auto`: Submits automatically only when explicitly enabled, subject to daily policy limits (`max_applications_per_day`).
  * Safety: No CAPTCHA/2FA bypass; stops immediately on 403/429 or unexpected DOM changes.

---

## 2. Habr Career (Хабр Карьера) — P1 Source

### Availability
* **Public API:** Public API is currently restricted/closed.
* **Harvesting Strategy:**
  * HTML listing parsing (`https://career.habr.com/vacancies?q=...`) using `fetch` with rate-limiting and exponential backoff.
  * Direct application API is not available; application action generates cover letter draft and opens direct vacancy URL in browser for manual submission.
  * Explicitly marked with operational warning in logs and reports.

---

## 3. FL.ru — P1 Source

### Availability
* **RSS Feed:** `https://www.fl.ru/rss/all.xml` / category RSS feeds.
* **Harvesting Strategy:**
  * Uses RSS XML parser (`fast-xml-parser` or `rss-parser`).
  * Filters project orders matching candidate profile (e.g., React, TypeScript, AI integrations).
* **Application Strategy:**
  * Auto-bidding disabled in MVP.
  * Prepares personalized proposal draft and opens proposal page for manual submission.

---

## 4. Avito — P2 Source

### Feasibility
* **Status:** `unsupported` (Disabled).
* **Reasoning:** Avito API (`developers.avito.ru`) focuses on employer/business tools, listing management, and messaging for hiring managers, not applicant search. Scraping user accounts directly violates Avito terms of service and risks immediate account lock.

---

## 5. Architectural Capability Matrix

| Source | Search Capability | Details Capability | Auto Apply | Risk Level | Strategy |
|---|---|---|---|---|---|
| **hh.ru** | API (`api.hh.ru/vacancies`) | API (`api.hh.ru/vacancies/:id`) | Playwright (`review`/`auto`) | Medium (Anti-bot on browser) | Primary harvesting source |
| **Habr Career** | Web HTML Adapter | Web HTML Adapter | Manual (Open Link) | Low-Medium (Rate limit) | Secondary source |
| **FL.ru** | RSS XML | RSS Item | Manual (Open Link) | Low | Freelance/project source |
| **Avito** | ❌ Unsupported | ❌ Unsupported | ❌ Unsupported | High | Disabled (`unsupported`) |
