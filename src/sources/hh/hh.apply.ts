import { chromium, BrowserContext } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationQueueItem, NormalizedJob, AuthStatus } from '../../domain/types.js';
import { HH_SELECTORS } from './hh.selectors.js';

export const REAL_SUBMIT_ENABLED = false;

export interface ApplyOptions {
  mode: 'dry-run' | 'review' | 'auto';
  userDataDir?: string;
}

export class HHPlaywrightApplier {
  private userDataDir: string;

  constructor(userDataDir = process.env.HH_PROFILE_DIR || './.browser_data/hh_profile') {
    this.userDataDir = userDataDir;
  }

  public async loginInteractive(timeoutMs = 120000): Promise<boolean> {
    if (!existsSync(this.userDataDir)) {
      mkdirSync(this.userDataDir, { recursive: true });
    }

    console.log('[PLAYWRIGHT] Launching browser context for manual HH.ru login...');
    console.log('[PLAYWRIGHT] Profile path:', this.userDataDir);
    console.log('[PLAYWRIGHT] Please complete login in the opened browser window.');

    const context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });

    try {
      const page = await context.newPage();
      await page.goto(HH_SELECTORS.loginUrl, { waitUntil: 'domcontentloaded' });
      console.log('[PLAYWRIGHT] Waiting for user authentication (up to 2 minutes)...');

      const startTime = Date.now();
      let authed = false;

      while (Date.now() - startTime < timeoutMs) {
        const isAuthed = await page.locator(HH_SELECTORS.mainMenuApplicant).isVisible().catch(() => false);
        const url = page.url();
        if (isAuthed || url.includes('/applicant/') || url.includes('/resumes')) {
          authed = true;
          break;
        }
        await page.waitForTimeout(3000);
      }

      await context.close();

      if (authed) {
        console.log('[PLAYWRIGHT] Login confirmed! Persistent browser profile saved.');
        return true;
      } else {
        console.warn('[PLAYWRIGHT] Login not confirmed within timeout.');
        return false;
      }
    } catch (err: any) {
      await context.close().catch(() => {});
      console.error('[PLAYWRIGHT] Error during interactive login:', err.message);
      return false;
    }
  }

  public async getSessionStatus(): Promise<AuthStatus> {
    if (!existsSync(this.userDataDir)) {
      return 'not_authenticated';
    }

    let context: BrowserContext | null = null;
    try {
      context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();
      const response = await page.goto(HH_SELECTORS.profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      if (response && (response.status() === 403 || response.status() === 429)) {
        await context.close();
        return 'blocked';
      }

      const blockedText = await page.locator(HH_SELECTORS.error403Or429).isVisible().catch(() => false);
      if (blockedText) {
        await context.close();
        return 'blocked';
      }

      const captchaDetected = await page.locator(HH_SELECTORS.captchaFrame).isVisible().catch(() => false);
      if (captchaDetected) {
        await context.close();
        return 'blocked';
      }

      const hasApplicantMenu = await page.locator(HH_SELECTORS.mainMenuApplicant).isVisible().catch(() => false);
      const url = page.url();

      await context.close();

      if (hasApplicantMenu || url.includes('/applicant/') || url.includes('/resumes')) {
        return 'authenticated';
      }

      return 'not_authenticated';
    } catch {
      if (context) {
        await context.close().catch(() => {});
      }
      return 'unknown';
    }
  }

  public async isAuthenticated(): Promise<boolean> {
    const status = await this.getSessionStatus();
    return status === 'authenticated';
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

    if (options.mode === 'auto' || !REAL_SUBMIT_ENABLED) {
      console.warn('[SAFETY GUARD] Real submission is disabled in this phase. Only read-only harvest and human review are available.');
      return {
        success: false,
        error: 'Real submission is disabled in this phase. Only read-only harvest and human review are available.',
      };
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
      const response = await page.goto(job.canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (response && (response.status() === 403 || response.status() === 429)) {
        throw new Error(`Rate limit or access block detected (HTTP ${response.status()}). Halting execution immediately.`);
      }

      await page.screenshot({ path: screenshotPath, fullPage: true });

      const captchaDetected = await page.locator(HH_SELECTORS.captchaFrame).isVisible().catch(() => false);
      if (captchaDetected) {
        throw new Error('CAPTCHA challenge detected on page. Automated bypass prohibited; halting application.');
      }

      if (options.mode === 'review') {
        console.log(`[REVIEW MODE] Rendered vacancy page for Job #${job.id}. Screenshot saved at ${screenshotPath}`);
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

