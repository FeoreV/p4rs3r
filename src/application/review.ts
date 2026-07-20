import { JobRepository } from '../db/repositories.js';
import { NormalizedJob } from '../domain/types.js';
import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ReviewOptions {
  source?: string;
  nonInteractive?: boolean;
}

export async function runReviewPipeline(repository: JobRepository, options: ReviewOptions = {}): Promise<void> {
  let vacancies = repository.getAllVacancies();

  if (options.source) {
    vacancies = vacancies.filter((v) => v.source.toLowerCase() === options.source!.toLowerCase());
  }

  const reviewItems = vacancies.filter((v) => v.status === 'scored' || v.status === 'needs_review' || v.status === 'discovered');

  console.log(`\n======================================================`);
  console.log(`[REVIEW] Candidate Human Review Flow (${reviewItems.length} items)`);
  console.log(`======================================================\n`);

  if (reviewItems.length === 0) {
    console.log('[REVIEW] No vacancies currently pending review.');
    return;
  }

  const isCI = options.nonInteractive || !process.stdin.isTTY;

  for (let i = 0; i < reviewItems.length; i++) {
    const job = reviewItems[i];
    console.log(`\n--- Item ${i + 1}/${reviewItems.length} [ID #${job.id}] ---`);
    console.log(`Title:       ${job.title}`);
    console.log(`Company:     ${job.company} (${job.companyUrl || 'N/A'})`);
    console.log(`Salary:      ${job.salaryFrom || job.salaryTo ? `${job.salaryFrom || ''} - ${job.salaryTo || ''} ${job.currency || ''}` : 'Not specified'}`);
    console.log(`Location:    ${job.location} (${job.isRemote ? 'Remote' : 'Office'})`);
    console.log(`Experience:  ${job.experience || 'Not specified'}`);
    console.log(`Published:   ${job.publishedAt}`);
    console.log(`Canonical:   ${job.canonicalUrl}`);
    console.log(`Status:      ${job.status}`);

    if (isCI) {
      console.log(`[REVIEW] Non-interactive mode (CI). Skipping prompt for Job #${job.id}.`);
      continue;
    }

    console.log(`\nAvailable actions:`);
    console.log(`  [o] open           - Open single vacancy page in Playwright browser`);
    console.log(`  [s] skip           - Skip item for now`);
    console.log(`  [a] mark-for-apply - Mark item as approved for manual application`);
    console.log(`  [e] export         - Export Markdown/JSON for manual response`);
    console.log(`  [q] quit           - Exit review loop\n`);

    // Interactive prompt reading single line
    const action = await promptUserAction();

    if (action === 'q' || action === 'quit') {
      console.log('[REVIEW] Exiting review flow.');
      break;
    } else if (action === 'o' || action === 'open') {
      console.log(`[REVIEW] Opening single vacancy URL: ${job.canonicalUrl}`);
      await openSinglePageInBrowser(job.canonicalUrl);
    } else if (action === 'a' || action === 'mark-for-apply') {
      repository.updateJobFilterStatus(job.id!, 'approved', []);
      console.log(`[REVIEW] Job #${job.id} marked as "approved".`);
    } else if (action === 'e' || action === 'export') {
      exportJobForManualApply(job);
    } else {
      console.log(`[REVIEW] Skipped Job #${job.id}.`);
    }
  }

  console.log('\n[REVIEW] Review session completed.');
}

async function promptUserAction(): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write('Select action [o/s/a/e/q]: ');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim().toLowerCase());
    });
  });
}

async function openSinglePageInBrowser(url: string): Promise<void> {
  const profileDir = process.env.HH_PROFILE_DIR || './.browser_data/hh_profile';
  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('[REVIEW] Browser opened. Press Ctrl+C or close window when done.');
    await page.waitForTimeout(10000);
    await context.close().catch(() => {});
  } catch (err: any) {
    console.warn(`[REVIEW] Failed to launch browser: ${err.message}`);
  }
}

function exportJobForManualApply(job: NormalizedJob): void {
  const exportDir = './data/exports';
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true });
  }

  const fileName = `vacancy_${job.id}_${job.externalId}.md`;
  const filePath = join(exportDir, fileName);

  const content = `# Vacancy #${job.id}: ${job.title} @ ${job.company}

- **URL:** ${job.canonicalUrl}
- **Location:** ${job.location} (${job.isRemote ? 'Remote' : 'Office'})
- **Salary:** ${job.salaryFrom || job.salaryTo ? `${job.salaryFrom || ''} - ${job.salaryTo || ''} ${job.currency || ''}` : 'Not specified'}
- **Published:** ${job.publishedAt}

## Description
${job.description}

## Manual Application Checklist
1. Open URL in authenticated browser: ${job.canonicalUrl}
2. Review company requirements.
3. Attach resume and send cover letter manually.
`;

  writeFileSync(filePath, content, 'utf8');
  console.log(`[REVIEW] Exported vacancy summary for manual application at ${filePath}`);
}
