import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JobRepository } from '../db/repositories.js';

export async function generateDailyReport(repository: JobRepository): Promise<string> {
  const allVacancies = repository.getAllVacancies();
  const recommended = repository.getQueueByStatus('recommended');
  const review = repository.getQueueByStatus('needs_review');
  const rejected = repository.getQueueByStatus('rejected');
  const applied = repository.getQueueByStatus('applied');
  const failed = repository.getQueueByStatus('failed');

  const dateStr = new Date().toISOString().slice(0, 10);
  const reportsDir = './reports';
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = join(reportsDir, `${dateStr}.md`);

  const content = `# AI Job Hunter — Daily Report (${dateStr})

## Summary Metrics
- **Total Found & Stored:** ${allVacancies.length}
- **Recommended (Ready to Apply):** ${recommended.length}
- **Needs Review:** ${review.length}
- **Applied:** ${applied.length}
- **Failed:** ${failed.length}
- **Rejected:** ${rejected.length}

---

## Applied Applications (${applied.length})
${applied.map((item) => {
    const job = allVacancies.find((v) => v.id === item.jobId);
    return `- **[${job?.title || 'Job'}](${job?.canonicalUrl})** @ ${job?.company || ''} (Score: ${item.score}) [Screenshot: ${item.screenshotPath || 'N/A'}]`;
  }).join('\n') || 'None'}

---

## Recommended Queue (${recommended.length})
${recommended.map((item) => {
    const job = allVacancies.find((v) => v.id === item.jobId);
    return `- **[${job?.title || 'Job'}](${job?.canonicalUrl})** @ ${job?.company || ''} (Score: ${item.score})`;
  }).join('\n') || 'None'}

---

## Needs Review Queue (${review.length})
${review.map((item) => {
    const job = allVacancies.find((v) => v.id === item.jobId);
    return `- **[${job?.title || 'Job'}](${job?.canonicalUrl})** @ ${job?.company || ''} (Score: ${item.score}) — ${item.errorMessage || 'Review required'}`;
  }).join('\n') || 'None'}
`;

  writeFileSync(reportPath, content, 'utf8');
  console.log(`[REPORT] Generated daily report at ${reportPath}`);

  // Send Telegram notification if configured
  await sendTelegramNotification(content);

  return reportPath;
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
