# RESEARCH.md — HeadHunter (hh.ru) API & Legal/Technical Feasibility Matrix

**Date:** 2026-07-20  
**Project:** MVP AI Job Hunter (p4rs3r)  
**Target Platform:** HeadHunter (`hh.ru`)

---

## 1. Official HeadHunter API Endpoint Audit

### Public Endpoints (No OAuth Required)
* **Vacancies Search:** `GET https://api.hh.ru/vacancies`
  * **Headers:** `User-Agent: <AppName>/<version> (<contact_email>)` (**Mandatory**; missing or generic User-Agent returns `400 Bad Request`).
  * **Supported Query Parameters:**
    * `text`: Search keywords (e.g., `React TypeScript`).
    * `area`: Regional ID (e.g., `1` for Moscow, `2` for Saint Petersburg, `113` for Russia).
    * `schedule`: `remote`, `fullDay`, `shift`, `flexible`, `flyInFlyOut`.
    * `employment`: `full`, `part`, `project`, `volunteer`, `probation`.
    * `experience`: `noExperience`, `between1And3`, `between3And6`, `moreThan6`.
    * `salary`: Target minimum salary amount in RUB.
    * `only_with_salary`: Boolean filter.
    * `page`: Page index (0-indexed).
    * `per_page`: Results per page (default 20, max 100).
    * `order_by`: `publication_time`, `salary_desc`, `relevance`.
* **Vacancy Details:** `GET https://api.hh.ru/vacancies/{vacancy_id}`
  * **Response:** Full vacancy object containing description HTML, key skills list, employer details, experience requirements, location, salary range, and application schema parameters (e.g., `response_letter_required`).
* **Dictionaries & Areas:** `GET https://api.hh.ru/dictionaries`, `GET https://api.hh.ru/areas`
  * Reference mappings for areas, specializations, schedules, and employment types.

### Protected / Applicant Endpoints (OAuth Required)
* **Applicant Profile:** `GET https://api.hh.ru/me`
  * Requires candidate OAuth 2.0 access token with `applicant` scope.
* **Applicant Resumes:** `GET https://api.hh.ru/resumes/mine`
  * Lists published candidate resumes.
* **Application / Negotiations API:** `POST https://api.hh.ru/negotiations` or `POST https://api.hh.ru/vacancies/{id}/apply`
  * **Status & Constraints:** Requires OAuth candidate authorization AND explicit HeadHunter API partner key approval for applicant applications.
  * **Strict API Policy:** HeadHunter limits programmatic application creation to approved client apps. Unapproved client applications face API `403 Forbidden` or instant account flagging.

---

## 2. Employer-Only Operations (Restricted)
* `GET /employers`, `POST /vacancies` (Posting job ads).
* Resume database search & candidate CV access (requires active employer paid subscription).
* Responding to applicants / managing applicant funnels.

---

## 3. Rate Limits & Automated System Restrictions
* **Rate Limits:** Standard public API limit is ~10 requests per second per IP address. Exceeding limits results in HTTP `429 Too Many Requests`.
* **User-Agent Policy:** Requests without a custom User-Agent identifying the app and contact email are blocked with `400 Bad Request`.
* **Anti-Bot & WAF Protection:**
  * Cloudflare / HeadHunter WAF monitors high-frequency traffic and anomalous header footprints.
  * Automated headless browser scraping triggers CAPTCHA challenges or HTTP `403 Forbidden`.
* **Terms of Service Compliance (Section 4):**
  * Automated mass scraping and automated application submissions without explicit authorization violate hh.ru Terms of Use.
  * **Policy Resolution:** Scraping, stealth evasion, CAPTCHA bypass, and automated submission are **strictly prohibited** in p4rs3r. Search and details MUST use official public API endpoints. Browser interaction is strictly limited to user-driven manual authentication and interactive human review (`REAL_SUBMIT_ENABLED=false`).

---

## 4. Operational Strategy Summary

| Capability | Allowed Mechanism | Authentication | Safety Controls |
|---|---|---|---|
| **Vacancy Search** | Official Public API (`api.hh.ru/vacancies`) | None (User-Agent header only) | Rate limiting, exponential backoff, max 100 per page |
| **Vacancy Details** | Official Public API (`api.hh.ru/vacancies/{id}`) | None (User-Agent header only) | Redacted response storage, timeout via AbortController |
| **Auth Verification** | Persistent Browser Context (`.browser_data/hh_profile`) | Manual login by User | DOM-based auth state detection, no cookie logging |
| **Filtering & Scoring** | Deterministic Policy Engine | None (Offline) | No-go keywords, experience bounds, zero LLM reliance for policy |
| **Application Submission** | ❌ **DISABLED** (`REAL_SUBMIT_ENABLED=false`) | Human Manual Only | Human review CLI flow; no programmatic submit or click |

