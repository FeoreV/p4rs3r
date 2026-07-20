import { Command } from 'commander';
import dotenv from 'dotenv';
import { getDatabase } from './db/client.js';
import { JobRepository } from './db/repositories.js';
import { runScanPipeline } from './application/scan.js';
import { runScoringPipeline } from './application/score.js';
import { runApplyPipeline } from './application/apply.js';
import { generateDailyReport } from './application/report.js';

dotenv.config();

const program = new Command();
program.name('ai-job-hunter').description('MVP AI Job Hunter for RU IT Market').version('1.0.0');

function getRepo(): JobRepository {
  const { db } = getDatabase();
  return new JobRepository(db);
}

function handleCommandAction<T extends any[]>(actionFn: (...args: T) => Promise<void> | void) {
  return async (...args: T) => {
    try {
      await actionFn(...args);
    } catch (err: any) {
      console.error(`[CLI ERROR] Command failed: ${err?.message || err}`);
      process.exit(1);
    }
  };
}

program
  .command('setup')
  .description('Initialize database and default configs')
  .action(
    handleCommandAction(() => {
      console.log('[SETUP] Initializing SQLite database and verifying configuration...');
      getDatabase();
      console.log('[SETUP] Initialization complete.');
    })
  );

program
  .command('login')
  .description('Interactive login to persistent browser profile for hh.ru')
  .option('-s, --source <source>', 'Source name (hh)', 'hh')
  .action(
    handleCommandAction(async (options: { source: string }) => {
      const repo = getRepo();
      if (options.source.toLowerCase() === 'hh') {
        const { HHPlaywrightApplier } = await import('./sources/hh/hh.apply.js');
        const applier = new HHPlaywrightApplier();
        const success = await applier.loginInteractive();
        const status = success ? 'authenticated' : 'not_authenticated';
        repo.setAuthStatus('hh', status);
        if (!success) {
          console.error('[LOGIN] Manual login failed or timed out.');
          process.exit(1);
        }
      } else {
        console.log(`[LOGIN] Source ${options.source} does not require interactive browser login.`);
      }
    })
  );

program
  .command('auth-status')
  .description('Check browser session authentication status')
  .option('-s, --source <source>', 'Source name (hh)', 'hh')
  .action(
    handleCommandAction(async (options: { source: string }) => {
      const repo = getRepo();
      if (options.source.toLowerCase() === 'hh') {
        const { HHPlaywrightApplier } = await import('./sources/hh/hh.apply.js');
        const applier = new HHPlaywrightApplier();
        const status = await applier.getSessionStatus();
        repo.setAuthStatus('hh', status);
        console.log(`[AUTH-STATUS] hh.ru auth status: ${status}`);
        if (status === 'not_authenticated' || status === 'blocked') {
          process.exit(1);
        }
      } else {
        console.log(`[AUTH-STATUS] Source ${options.source} does not require authentication.`);
      }
    })
  );

program
  .command('scan')
  .description('Harvest jobs from sources')
  .option('-s, --source <sources>', 'Comma-separated source names', 'hh,habr,fl')
  .option('-q, --query <query>', 'Search keywords query')
  .option('-a, --area <area>', 'Area ID (113 for Russia)', parseInt)
  .option('-p, --page <page>', 'Page number (0-indexed)', parseInt)
  .option('--pages <pages>', 'Number of pages to scan', parseInt)
  .option('--per-page <perPage>', 'Results per page', parseInt)
  .option('--remote-only', 'Filter remote vacancies only')
  .option('--since <since>', 'Filter since ISO date')
  .option('-l, --limit <limit>', 'Maximum vacancies to fetch', parseInt)
  .option('--no-details', 'Skip detailed vacancy page fetching')
  .option('--json', 'Output stats in JSON format')
  .action(
    handleCommandAction(async (options: any) => {
      const repo = getRepo();
      const sources = options.source ? options.source.split(',').map((s: string) => s.trim()) : ['hh', 'habr', 'fl'];
      const stats = await runScanPipeline(repo, sources, {
        query: options.query,
        area: options.area,
        page: options.page,
        pages: options.pages,
        perPage: options.perPage,
        remoteOnly: options.remoteOnly,
        since: options.since,
        limit: options.limit,
        noDetails: options.noDetails,
        json: options.json,
      });

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
      }
    })
  );

program
  .command('filter')
  .description('Run deterministic policy filter on harvested vacancies without LLM')
  .action(
    handleCommandAction(async () => {
      const repo = getRepo();
      const { runFilterPipeline } = await import('./application/filter.js');
      await runFilterPipeline(repo);
    })
  );

program
  .command('score')
  .description('Score unscored jobs in database')
  .action(
    handleCommandAction(async () => {
      const repo = getRepo();
      await runScoringPipeline(repo);
    })
  );

program
  .command('review')
  .description('Interactive CLI review of recommended items')
  .option('-s, --source <source>', 'Source filter (hh, habr, etc.)')
  .action(
    handleCommandAction(async (options: { source?: string }) => {
      const repo = getRepo();
      const { runReviewPipeline } = await import('./application/review.js');
      await runReviewPipeline(repo, { source: options.source });
    })
  );

program
  .command('apply')
  .description('Apply to recommended jobs')
  .option('-m, --mode <mode>', 'Mode: dry-run, review, auto', 'review')
  .option('-l, --limit <limit>', 'Maximum applications in this run', parseInt)
  .action(
    handleCommandAction(async (options: { mode?: string; limit?: number }) => {
      const repo = getRepo();
      const mode = options.mode || 'review';
      if (mode === 'auto') {
        console.warn('[SAFETY GUARD] Real submission is disabled in this phase. Only read-only harvest and human review are available.');
        process.exit(1);
      }
      await runApplyPipeline(repo, { mode: mode as any, limit: options.limit });
    })
  );

program
  .command('report')
  .description('Generate daily markdown & json report')
  .option('-s, --source <source>', 'Source filter')
  .action(
    handleCommandAction(async (options: { source?: string }) => {
      const repo = getRepo();
      await generateDailyReport(repo, { source: options.source });
    })
  );

program
  .command('weekly')
  .description('Run full weekly pipeline: scan, filter, score, review, report')
  .option('-s, --source <sources>', 'Sources to scan', 'hh,habr,fl')
  .action(
    handleCommandAction(async (options: { source: string }) => {
      const repo = getRepo();
      const sources = options.source.split(',').map((s: string) => s.trim());
      console.log('[WEEKLY] Starting automated weekly run...');
      await runScanPipeline(repo, sources);
      const { runFilterPipeline } = await import('./application/filter.js');
      await runFilterPipeline(repo);
      await runScoringPipeline(repo);
      await runApplyPipeline(repo, { mode: 'dry-run' });
      await generateDailyReport(repo, { source: options.source });
      console.log('[WEEKLY] Full weekly pipeline completed.');
    })
  );

program
  .command('panic-stop')
  .description('Emergency panic stop: lock auto-apply and purge pending queue')
  .action(
    handleCommandAction(() => {
      const repo = getRepo();
      repo.setPanicLock(true);
      const purgedCount = repo.purgePendingQueue();
      repo.logAudit('PANIC_STOP', undefined, undefined, { purgedCount });
      console.log(`[PANIC-STOP] Emergency panic stop executed. Lock enabled and purged ${purgedCount} items from pending queue.`);
    })
  );

program.parse(process.argv);

