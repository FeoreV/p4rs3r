import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/client.js';
import { JobRepository } from '../src/db/repositories.js';
import { runScanPipeline } from '../src/application/scan.js';
import { runScoringPipeline } from '../src/application/score.js';
import { runApplyPipeline } from '../src/application/apply.js';

describe('Dry-Run Safety & Isolation', () => {
  let repo: JobRepository;

  beforeEach(() => {
    const { db } = getDatabase(':memory:');
    repo = new JobRepository(db);
  });

  it('proves apply in dry-run mode never marks records as applied or submitted', async () => {
    await runScanPipeline(repo, ['fixture']);
    await runScoringPipeline(repo);

    const applyRes = await runApplyPipeline(repo, { mode: 'dry-run' });

    expect(applyRes.processedCount).toBeGreaterThan(0);
    expect(applyRes.appliedCount).toBe(0);

    const appliedItems = repo.getQueueByStatus('applied');
    const submittedItems = repo.getQueueByStatus('submitted');

    expect(appliedItems.length).toBe(0);
    expect(submittedItems.length).toBe(0);
  });
});
