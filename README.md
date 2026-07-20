# MVP AI Job Hunter (RU Market)

A CLI-driven, safety-first job automation tool for 18-year-old React, TypeScript, and Node.js developers in the Russian IT market (targeting `hh.ru`, `Habr Career`, and `FL.ru`).

---

## 1. Quick Start & Setup

### Requirements
- Node.js v22+
- npm v10+

### Installation
```bash
# Clone the repository and install dependencies
npm install

# Copy environment variables template
cp .env.example .env

# Initialize database and verify config
npm run setup
```

---

## 2. Environment Configuration (`.env`)

Configure your OpenAI-compatible LLM endpoint and optional Telegram alert bot in `.env`:

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your_api_key_here
LLM_MODEL=gpt-4o-mini

TELEGRAM_BOT_TOKEN=your_bot_token_optional
TELEGRAM_CHAT_ID=your_chat_id_optional
```

---

## 3. Persistent Browser Login (`hh.ru`)

To log into HeadHunter for interactive application submission:

```bash
npm run login -- --source hh
```
This opens a Chromium browser context. Complete the login manually. The persistent profile is stored locally in `.browser_data/hh_profile` (git-ignored).

---

## 4. CLI Command Reference

| Command | Description |
|---|---|
| `npm run setup` | Initializes SQLite database and verifies YAML configs |
| `npm run login -- --source hh` | Launches interactive browser window for manual HH authentication |
| `npm run scan -- --source hh,habr,fl` | Harvester pipeline across specified job sources |
| `npm run score` | Runs structured LLM scoring (0-100) and hallucination-free cover letter generator |
| `npm run review` | Interactive CLI approval for pending queue items |
| `npm run apply -- --mode dry-run` | Simulates submissions without hitting network or forms |
| `npm run apply -- --mode review` | Pre-fills form, captures screenshot, requests user confirmation |
| `npm run apply -- --mode auto --limit 3` | Submits applications up to quota limit (if `auto_apply: true` in policy) |
| `npm run report` | Renders daily Markdown report in `reports/YYYY-MM-DD.md` |
| `npm run weekly` | Idempotent full workflow execution (scan -> score -> dry-run apply -> report) |
| `npm run panic-stop` | Emergency killswitch: purges pending queue and locks auto-apply mode |

---

## 5. Automated Scheduling (Cron Example)

To run the job hunter automatically every Monday at 09:00 AM:

```cron
0 9 * * 1 cd /path/to/project && /usr/local/bin/npm run weekly >> /path/to/project/cron.log 2>&1
```

---

## 6. Threat Model & Safety Rules

1. **Strict Non-Spam Guarantee**: `auto_apply` is set to `false` by default in `config/policy.yaml`.
2. **Account Safety**: No stealth techniques, anti-bot bypasses, or CAPTCHA solvers are used. Requests respect standard user intervals and rate limits.
3. **No Hallucinations**: Cover letters strictly utilize facts from `config/profile.yaml`. Unverified commercial experience, degrees, or unlisted tech stacks are blocked by safety guards.
4. **Unknown Form Questions**: Job application forms containing unknown required input fields are automatically moved to `needs_review` for human decision-making.
5. **Emergency Rollback / Panic Stop**: Running `npm run panic-stop` instantly purges pending queues and prevents unintended form submissions.

---

## 7. Source Matrix & Limitations

| Source | Search | Details | Auto Apply | Operational Notes |
|---|---|---|---|---|
| **hh.ru** | API (`api.hh.ru/vacancies`) | API (`api.hh.ru/vacancies/:id`) | Playwright persistent session | Primary source. Requires `User-Agent` header. |
| **Habr Career** | HTML Web Harvester | Web Listing | Manual (Link) | Public listing adapter. Submissions require browser link. |
| **FL.ru** | RSS Feed (`/rss/all.xml`) | RSS Item | Manual (Link) | Freelance project feed. Proposal drafts generated for direct link. |
| **Avito** | Disabled | Disabled | Disabled | Marked `unsupported`. Employer API only. |

---

## 8. Verification & Testing

Run unit & integration test suite (includes full offline pipeline verification on fixture data):

```bash
npm test
```
"# p4rs3r" 
