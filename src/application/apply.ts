import { JobRepository } from '../db/repositories.js';
import { loadProfileConfig } from './scan.js';
import { SafetyLimitGuard } from '../safety/limits.js';
import { promptHumanConfirmation } from '../safety/approval.js';
import { AuditLogger } from '../safety/audit.js';

export interface ApplyPipelineOptions {
  mode: 'dry-run' | 'review' | 'auto';
  limit?: number;
}

export async function runApplyPipeline(
  repository: JobRepository,
  options: ApplyPipelineOptions
): Promise<{ processedCount: number; appliedCount: number; failedCount: number }> {
  const profile = loadProfileConfig();
  const guard = new SafetyLimitGuard(repository, profile.policy);
  const audit = new AuditLogger(repository);

  if (guard.isPanicLocked()) {
    console.warn('[APPLY] Application blocked: Panic stop is currently ACTIVE.');
    return { processedCount: 0, appliedCount: 0, failedCount: 0 };
  }

  if (options.mode === 'auto' && !profile.policy.auto_apply) {
    console.warn('[APPLY] Auto-apply is disabled in policy.yaml. Falling back to review mode.');
    options.mode = 'review';
  }

  const recommendedItems = repository.getQueueByStatus('recommended');
  const reviewItems = repository.getQueueByStatus('needs_review');
  const itemsToProcess = [...recommendedItems, ...reviewItems];

  const maxLimit = options.limit ?? profile.policy.max_applications_per_run;
  const targetItems = itemsToProcess.slice(0, maxLimit);

  console.log(`[APPLY] Running application pipeline in mode: "${options.mode}". Candidate items: ${targetItems.length}`);

  let processedCount = 0;
  let appliedCount = 0;
  let failedCount = 0;

  const allJobs = repository.getAllVacancies();

  if (options.mode === 'dry-run') {
    for (const item of targetItems) {
      const quotaCheck = guard.checkApplicationQuotas(appliedCount);
      if (!quotaCheck.allowed) {
        console.warn(`[APPLY] Application stopped: ${quotaCheck.reason}`);
        break;
      }

      const job = allJobs.find((j) => j.id === item.jobId);
      if (!job) continue;

      processedCount++;
      console.log(`[DRY-RUN] Simulating application for Job #${job.id}: ${job.title} @ ${job.company}`);
      console.log(`[DRY-RUN] Planned action: Render cover letter draft and display limits.`);
      console.log(`[DRY-RUN] Cover letter text:\n${item.coverLetterText || '(No letter generated)'}\n`);

      repository.createApplicationDraft(job.id!, item.coverLetterText || '', item.coverLetterTone || 'neutral');
      audit.recordAuditEvent('DRY_RUN_SIMULATED', job.id!, job.canonicalUrl, { title: job.title });
    }

    console.log(`[DRY-RUN] Completed simulation for ${processedCount} items. Database status remains unchanged.`);
    return { processedCount, appliedCount: 0, failedCount: 0 };
  }

  // Dynamic import of HHPlaywrightApplier ONLY for non-dry-run modes (review, auto)
  const { HHPlaywrightApplier } = await import('../sources/hh/hh.apply.js');
  const applier = new HHPlaywrightApplier();

  for (const item of targetItems) {
    const quotaCheck = guard.checkApplicationQuotas(appliedCount);
    if (!quotaCheck.allowed) {
      console.warn(`[APPLY] Application stopped: ${quotaCheck.reason}`);
      break;
    }

    const job = allJobs.find((j) => j.id === item.jobId);
    if (!job) continue;

    processedCount++;

    if (options.mode === 'review') {
      const approved = await promptHumanConfirmation(job, item);
      if (!approved) {
        console.log(`[APPLY] User skipped application for Job #${job.id}`);
        repository.updateQueueStatus(item.id!, 'needs_review', { errorMessage: 'User declined review prompt' });
        continue;
      }
    }

    const result = await applier.applyToJob(job, item, { mode: options.mode });

    if (result.success && options.mode === 'auto') {
      appliedCount++;
      repository.updateQueueStatus(item.id!, 'submitted', { screenshotPath: result.screenshotPath });
      audit.recordApplicationSubmitted(job.id!, job.canonicalUrl, options.mode, item.coverLetterText || '');
      console.log(`[APPLY] Application status recorded as submitted for Job #${job.id}`);
    } else if (result.success && options.mode === 'review') {
      repository.updateQueueStatus(item.id!, 'needs_review', { screenshotPath: result.screenshotPath });
      console.log(`[APPLY] Review draft prepared for Job #${job.id}. Screenshot: ${result.screenshotPath || 'N/A'}`);
    } else {
      failedCount++;
      repository.updateQueueStatus(item.id!, 'failed', { screenshotPath: result.screenshotPath, errorMessage: result.error });
      audit.recordApplicationFailed(job.id!, job.canonicalUrl, result.error || 'Unknown apply error');
      console.warn(`[APPLY] Application failed for Job #${job.id}: ${result.error}`);
    }
  }

  return { processedCount, appliedCount, failedCount };
}
