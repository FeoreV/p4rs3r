import { JobRepository } from '../db/repositories.js';
import { loadProfileConfig } from './scan.js';
import { LLMScorer } from '../ai/scorer.js';
import { CoverLetterGenerator } from '../ai/cover-letter.js';
import { AuditLogger } from '../safety/audit.js';
import { QueueStatus } from '../domain/types.js';

export async function runScoringPipeline(repository: JobRepository): Promise<{ scoredCount: number }> {
  const profile = loadProfileConfig();
  const scorer = new LLMScorer();
  const coverGen = new CoverLetterGenerator();
  const audit = new AuditLogger(repository);

  const unscored = repository.getUnscoredVacancies();
  console.log(`[SCORE] Found ${unscored.length} unscored vacancies in database.`);

  let scoredCount = 0;

  for (const job of unscored) {
    console.log(`[SCORE] Scoring Job #${job.id}: ${job.title} @ ${job.company}`);
    const scoringResult = await scorer.scoreJob(profile, job);

    let status: QueueStatus = 'rejected';
    if (scoringResult.score >= profile.policy.min_score && scoringResult.recommendation === 'apply') {
      status = 'recommended';
    } else if (scoringResult.score >= profile.policy.review_score || scoringResult.recommendation === 'review') {
      status = 'needs_review';
    }

    let coverLetterText: string | undefined;
    if (status === 'recommended' || status === 'needs_review') {
      coverLetterText = await coverGen.generateCoverLetter(profile, job, 'neutral');
    }

    const now = new Date().toISOString();
    repository.saveQueueItem({
      jobId: job.id!,
      status,
      score: scoringResult.score,
      scoringResult,
      coverLetterTone: 'neutral',
      coverLetterText,
      createdAt: now,
      updatedAt: now,
    });

    audit.recordScoring(job.id!, scoringResult.score, status);
    scoredCount++;
  }

  console.log(`[SCORE] Scoring complete for ${scoredCount} vacancies.`);
  return { scoredCount };
}
