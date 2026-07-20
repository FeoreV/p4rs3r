import { chromium, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationQueueItem, NormalizedJob } from '../../domain/types.js';

export interface ApplyOptions {
  mode: 'dry-run' | 'review' | 'auto';
  userDataDir?: string;
}

export class HHPlaywrightApplier {
  private userDataDir: string;

  constructor(userDataDir = './.browser_data/hh_profile') {
    this.userDataDir = userDataDir;
  }

  public async loginInteractive(): Promise<void> {
    if (!existsSync(this.userDataDir)) {
      mkdirSync(this.userDataDir, { recursive: true });
    }

    console.log('[PLAYWRIGHT] Launching browser context for manual HH.ru login...');
    console.log('[PLAYWRIGHT] Please complete login in the opened browser window.');

    const context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto('https://hh.ru/account/login');
    console.log('[PLAYWRIGHT] Waiting 60 seconds for user authentication...');
    await page.waitForTimeout(60000);

    await context.close();
    console.log('[PLAYWRIGHT] Persistent browser profile saved successfully.');
  }

  public async applyToJob(
    job: NormalizedJob,
    queueItem: ApplicationQueueItem,
    options: ApplyOptions
  ): Promise<{ success: boolean; screenshotPath?: string; error?: string }> {
    if (options.mode === 'dry-run') {
      console.log(`[DRY-RUN] Simulating application for Job #${job.id}: ${job.title} @ ${job.company}`);
      console.log(`[DRY-RUN] Cover letter text:\n${queueItem.coverLetterText}`);
      return { success: true };
    }

    if (!existsSync(this.userDataDir)) {
      mkdirSync(this.userDataDir, { recursive: true });
    }

    const screenshotsDir = './screenshots';
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    const screenshotPath = join(screenshotsDir, `job_${job.id}_${Date.now()}.png`);

    let context: BrowserContext | null = null;
    try {
      context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: process.env.NODE_ENV === 'test' ? true : false,
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();
      console.log(`[PLAYWRIGHT] Navigating to vacancy URL: ${job.canonicalUrl}`);
      await page.goto(job.canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Look for apply button (HH vacancy apply button selectors)
      const respondButton = page.locator('a[data-qa="vacancy-response-link-top"], button[data-qa="vacancy-response-link-top"]').first();
      const hasRespondButton = await respondButton.isVisible().catch(() => false);

      if (!hasRespondButton) {
        throw new Error('Vacancy application button not found or already applied.');
      }

      if (options.mode === 'review') {
        console.log(`[REVIEW MODE] Renders application page for Job #${job.id}. Screenshot saved at ${screenshotPath}`);
        await context.close();
        return { success: true, screenshotPath };
      }

      if (options.mode === 'auto') {
        console.log(`[AUTO MODE] Clicking apply button for Job #${job.id}...`);
        await respondButton.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: screenshotPath });

        // If cover letter textarea is visible, fill it
        const letterTextarea = page.locator('textarea[data-qa="vacancy-response-popup-form-letter-input"]').first();
        if (await letterTextarea.isVisible().catch(() => false)) {
          await letterTextarea.fill(queueItem.coverLetterText || '');
        }

        // Check for unknown mandatory questions
        const mandatoryQuestions = page.locator('.vacancy-response-popup__question--required');
        const questionCount = await mandatoryQuestions.count().catch(() => 0);
        if (questionCount > 0) {
          throw new Error(`Vacancy requires answering ${questionCount} unknown mandatory question(s). Moved to needs_review.`);
        }

        const submitBtn = page.locator('button[data-qa="vacancy-response-submit-popup"]').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
        }

        await context.close();
        return { success: true, screenshotPath };
      }

      await context.close();
      return { success: true, screenshotPath };
    } catch (err: any) {
      if (context) {
        await context.close().catch(() => {});
      }
      return { success: false, screenshotPath, error: err.message };
    }
  }
}
