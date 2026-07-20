import { Command } from 'commander';
import dotenv from 'dotenv';
import { getDatabase } from './db/client.js';
import { JobRepository } from './db/repositories.js';
import { runScanPipeline } from './application/scan.js';
import { runScoringPipeline } from './application/score.js';
import { runApplyPipeline } from './application/apply.js';
import { generateDailyReport } from './application/report.js';
import { HHPlaywrightApplier } from './sources/hh/hh.apply.js';

dotenv.config();

const program = new Command();
program.name('ai-job-hunter').description('MVP AI Job Hunter for RU IT Market').version('1.0.0');

function getRepo(): JobRepository {
  const { db } = getDatabase();
  return new JobRepository(db);
}

program
  .command('setup')
  .description('Initialize database and default configs')
  .action(() => {
    console.log('[SETUP] Initializing SQLite database and verifying configuration...');
    getDatabase();
    console.log('[SETUP] Initialization complete.');
  });

program
  .command('login')
  .description('Interactive login to persistent browser profile for hh.ru')
  .option('-s, --source <source>', 'Source name (hh)', 'hh')
  .action(async (options) => {
    if (options.source.toLowerCase() === 'hh') {
      const applier = new HHPlaywrightApplier();
      await applier.loginInteractive();
    } else {
      console.log(`[LOGIN] Source ${options.source} does not require interactive browser login.`);
    }
  });

program
  .command('scan')
  .description('Harvest jobs from sources')
  .option('-s, --source <sources>', 'Comma-separated source names', 'hh,habr,fl')
  .action(async (options) => {
    const repo = getRepo();
    const sources = options.source.split(',').map((s: string) => s.trim());
    await runScanPipeline(repo, sources);
  });

program
  .command('score')
  .description('Score unscored jobs in database')
  .action(async () => {
    const repo = getRepo();
    await runScoringPipeline(repo);
  });

program
  .command('review')
  .description('Interactive CLI review of recommended items')
  .action(async () => {
    const repo = getRepo();
    await runApplyPipeline(repo, { mode: 'review' });
  });

program
  .command('apply')
  .description('Apply to recommended jobs')
  .option('-m, --mode <mode>', 'Mode: dry-run, review, auto', 'review')
  .option('-l, --limit <limit>', 'Maximum applications in this run', parseInt)
  .action(async (options) => {
    const repo = getRepo();
    const mode = options.mode as 'dry-run' | 'review' | 'auto';
    await runApplyPipeline(repo, { mode, limit: options.limit });
  });

program
  .command('report')
  .description('Generate daily markdown report')
  .action(async () => {
    const repo = getRepo();
    await generateDailyReport(repo);
  });

program
  .command('weekly')
  .description('Run full weekly pipeline: scan, score, review, report')
  .option('-s, --source <sources>', 'Sources to scan', 'hh,habr,fl')
  .action(async (options) => {
    const repo = getRepo();
    const sources = options.source.split(',').map((s: string) => s.trim());
    console.log('[WEEKLY] Starting automated weekly run...');
    await runScanPipeline(repo, sources);
    await runScoringPipeline(repo);
    await runApplyPipeline(repo, { mode: 'dry-run' });
    await generateDailyReport(repo);
    console.log('[WEEKLY] Full weekly pipeline completed.');
  });

program
  .command('panic-stop')
  .description('Emergency panic stop: lock auto-apply and purge pending queue')
  .action(() => {
    const repo = getRepo();
    const purgedCount = repo.purgePendingQueue();
    repo.logAudit('PANIC_STOP', undefined, undefined, { purgedCount });
    console.log(`[PANIC-STOP] Emergency panic stop executed. Purged ${purgedCount} items from pending queue.`);
  });

program.parse(process.argv);
