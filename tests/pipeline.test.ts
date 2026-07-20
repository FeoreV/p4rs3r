import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/client.js';
import { JobRepository } from '../src/db/repositories.js';
import { runScanPipeline } from '../src/application/scan.js';
import { runScoringPipeline } from '../src/application/score.js';
import { runApplyPipeline } from '../src/application/apply.js';
import { generateDailyReport } from '../src/application/report.js';

describe('Full Offline Pipeline Execution', () => {
  let repo: JobRepository;

  beforeEach(() => {
    const { db } = getDatabase(':memory:');
    repo = new JobRepository(db);
  });

  it('runs complete pipeline from fixture scanning to daily report generation without network', async () => {
    // 1. Scan fixture source
    const scanRes = await runScanPipeline(repo, ['fixture']);
    expect(scanRes.foundCount).toBeGreaterThan(0);
    expect(scanRes.insertedCount).toBeGreaterThan(0);

    // 2. Score vacancies
    const scoreRes = await runScoringPipeline(repo);
    expect(scoreRes.scoredCount).toBe(scanRes.insertedCount);

    // 3. Dry-run apply
    const applyRes = await runApplyPipeline(repo, { mode: 'dry-run', limit: 5 });
    expect(applyRes.processedCount).toBeGreaterThanOrEqual(0);

    // 4. Report generation
    const reportPath = await generateDailyReport(repo);
    expect(reportPath).toContain('.md');
  });

  it('prevents duplicate insertions on re-scanning', async () => {
    const scan1 = await runScanPipeline(repo, ['fixture']);
    const scan2 = await runScanPipeline(repo, ['fixture']);
    expect(scan2.insertedCount).toBe(0);
  });
});
