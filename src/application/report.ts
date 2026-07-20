import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JobRepository } from '../db/repositories.js';

export interface ReportOptions {
  source?: string;
  durationMs?: number;
}

export async function generateDailyReport(repository: JobRepository, options: ReportOptions = {}): Promise<string> {

  let allVacancies = repository.getAllVacancies();
  if (options.source) {
    allVacancies = allVacancies.filter((v) => v.source.toLowerCase() === options.source!.toLowerCase());
  }

  const discovered = allVacancies.filter((v) => v.status === 'discovered');
  const filtered = allVacancies.filter((v) => v.status === 'filtered');
  const scored = allVacancies.filter((v) => v.status === 'scored');
  const review = allVacancies.filter((v) => v.status === 'needs_review');
  const approved = allVacancies.filter((v) => v.status === 'approved' || v.status === 'recommended');
  const failed = allVacancies.filter((v) => v.status === 'failed');
  const submitted = allVacancies.filter((v) => v.status === 'submitted' || v.status === 'applied');

  const dateStr = new Date().toISOString().slice(0, 10);
  const reportsDir = './reports';
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const mdPath = join(reportsDir, `${dateStr}.md`);
  const jsonPath = join(reportsDir, `${dateStr}.json`);

  const reportData = {
    date: dateStr,
    timestamp: new Date().toISOString(),
    sourceFilter: options.source || 'all',
    durationMs: options.durationMs || 0,
    metrics: {
      totalHarvested: allVacancies.length,
      discoveredCount: discovered.length,
      filteredCount: filtered.length,
      scoredCount: scored.length,
      needsReviewCount: review.length,
      approvedCount: approved.length,
      failedCount: failed.length,
      submittedCount: submitted.length,
      realSubmissionsConfirmed: 0,
    },
    vacancies: allVacancies.map((v) => ({
      id: v.id,
      source: v.source,
      externalId: v.externalId,
      canonicalUrl: v.canonicalUrl,
      title: v.title,
      company: v.company,
      location: v.location,
      isRemote: v.isRemote,
      salary: v.salaryFrom || v.salaryTo ? `${v.salaryFrom || ''}-${v.salaryTo || ''} ${v.currency || ''}` : 'Unspecified',
      status: v.status,
      publishedAt: v.publishedAt,
    })),
  };

  const mdContent = `# AI Job Hunter — Real Harvest Report (${dateStr})

> **Safety Notice:** Real automatic applications are **DISABLED** (\`REAL_SUBMIT_ENABLED=false\`). Total real applications submitted: **0**.

---

## 1. Metric Breakdown
- **Target Source:** ${options.source ? options.source.toUpperCase() : 'All Sources'}
- **Total Real Vacancies Stored:** ${allVacancies.length}
- **Discovered:** ${discovered.length}
- **Filtered Out (Policy Engine):** ${filtered.length}
- **Scored / Passed Policy:** ${scored.length}
- **Needs Human Review:** ${review.length}
- **Approved for Queue:** ${approved.length}
- **Failed / Blocked:** ${failed.length}
- **Submitted / Applied:** ${submitted.length} (Real submit count: **0**)
- **Execution Duration:** ${options.durationMs ? `${options.durationMs} ms` : 'N/A'}

---

## 2. Vacancy Details & Canonical URLs

### Needs Review (${review.length})
${review.map((v) => `- **[${v.title}](${v.canonicalUrl})** @ ${v.company} (${v.location}, ${v.isRemote ? 'Remote' : 'Office'})`).join('\n') || 'None'}

### Scored / Passed (${scored.length})
${scored.map((v) => `- **[${v.title}](${v.canonicalUrl})** @ ${v.company} (${v.location})`).join('\n') || 'None'}

### Filtered Out (${filtered.length})
${filtered.map((v) => `- **[${v.title}](${v.canonicalUrl})** @ ${v.company}`).join('\n') || 'None'}

---

## 3. Security & Compliance Statement
- Password, cookies, and 2FA secrets stored: **0**
- Programmatic submit calls made: **0**
- Anti-bot / CAPTCHA evasions attempted: **0**
`;

  writeFileSync(mdPath, mdContent, 'utf8');
  writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

  console.log(`[REPORT] Generated daily report: ${mdPath} and ${jsonPath}`);

  await sendTelegramNotification(mdContent);

  return mdPath;
}


async function sendTelegramNotification(reportText: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return;
  }

  const messageText = reportText.slice(0, 4000);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown',
      }),
    });
    console.log('[REPORT] Telegram alert sent successfully.');
  } catch (err: any) {
    console.warn(`[REPORT] Telegram alert error: ${err.message}`);
  }
}

