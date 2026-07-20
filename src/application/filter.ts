import { JobRepository } from '../db/repositories.js';
import { loadProfileConfig } from './scan.js';
import { NormalizedJob, PolicyFilterReason, PolicyFilterResult, JobStatus } from '../domain/types.js';
import { AuditLogger } from '../safety/audit.js';

export function evaluateDeterministicPolicy(
  job: NormalizedJob,
  profile = loadProfileConfig()
): PolicyFilterResult {
  const candidate = profile.candidate;
  const reasons: PolicyFilterReason[] = [];

  const textToScan = `${job.title} ${job.description} ${job.company} ${job.experience || ''} ${job.employmentType || ''}`.toLowerCase();

  // 1. Check No-Go phrases
  if (candidate.no_go && Array.isArray(candidate.no_go)) {
    for (const phrase of candidate.no_go) {
      const lowerPhrase = phrase.toLowerCase();
      if (lowerPhrase === 'sales' && (textToScan.includes('продаж') || textToScan.includes('sales') || textToScan.includes('холодн'))) {
        reasons.push({
          code: 'NO_GO_PHRASE',
          message: `Matched no-go policy phrase: "${phrase}"`,
        });
      } else if (lowerPhrase.includes('unpaid') && (textToScan.includes('без оплаты') || textToScan.includes('неоплачиваем') || textToScan.includes('unpaid'))) {
        reasons.push({
          code: 'NO_GO_PHRASE',
          message: `Matched no-go policy phrase: "${phrase}"`,
        });
      } else if (lowerPhrase.includes('relocation') && (textToScan.includes('переезд') || textToScan.includes('релокац'))) {
        reasons.push({
          code: 'NO_GO_PHRASE',
          message: `Matched no-go policy phrase: "${phrase}"`,
        });
      } else if (textToScan.includes(lowerPhrase)) {
        reasons.push({
          code: 'NO_GO_PHRASE',
          message: `Matched no-go policy phrase: "${phrase}"`,
        });
      }
    }
  }

  // 2. Check Remote Mismatch
  if (candidate.remote_only && !job.isRemote && !job.remote) {
    const isExplicitOffice = textToScan.includes('офис') || textToScan.includes('on-site') || textToScan.includes('in-office');
    if (isExplicitOffice && !textToScan.includes('удален') && !textToScan.includes('remote')) {
      reasons.push({
        code: 'FORMAT_MISMATCH',
        message: 'Candidate requires remote work, but vacancy is office-only.',
      });
    }
  }

  // 3. Check Seniority / Experience Mismatch
  const titleLower = job.title.toLowerCase();
  const expLower = (job.experience || '').toLowerCase();
  if (candidate.experience_years <= 1) {
    if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('сеньор') || titleLower.includes('лид') || expLower.includes('between3and6') || expLower.includes('morethan6') || textToScan.includes('от 3 лет') || textToScan.includes('от 5 лет')) {
      reasons.push({
        code: 'SENIORITY_MISMATCH',
        message: 'Vacancy requires Senior/Lead experience (3+ years), profile experience is Junior.',
      });
    }
  }

  // 4. Check Salary bounds (Missing salary is NOT a reject reason, moves to needs_review/neutral)
  let salaryNeedsReview = false;
  if (job.salaryTo != null && candidate.target_salary_rub > 0) {
    if (job.salaryTo < candidate.target_salary_rub * 0.6) {
      reasons.push({
        code: 'SALARY_TOO_LOW',
        message: `Maximum salary (${job.salaryTo} ${job.currency || 'RUB'}) is significantly below target (${candidate.target_salary_rub} RUB).`,
      });
    }
  } else if (job.salaryFrom == null && job.salaryTo == null) {
    salaryNeedsReview = true;
  }

  if (reasons.length > 0) {
    return {
      decision: 'filtered',
      reasons,
    };
  }

  if (salaryNeedsReview) {
    return {
      decision: 'needs_review',
      reasons: [{ code: 'SALARY_UNSPECIFIED', message: 'Salary is not specified in vacancy details.' }],
    };
  }

  return {
    decision: 'passed',
    reasons: [],
  };
}

export async function runFilterPipeline(repository: JobRepository): Promise<{
  totalEvaluated: number;
  filteredCount: number;
  needsReviewCount: number;
  passedCount: number;
}> {
  const profile = loadProfileConfig();
  const audit = new AuditLogger(repository);
  const allVacancies = repository.getAllVacancies();

  let totalEvaluated = 0;
  let filteredCount = 0;
  let needsReviewCount = 0;
  let passedCount = 0;

  console.log(`[FILTER] Starting deterministic policy filtering for ${allVacancies.length} vacancies...`);

  for (const job of allVacancies) {
    totalEvaluated++;
    const result = evaluateDeterministicPolicy(job, profile);

    let newStatus: JobStatus;
    if (result.decision === 'filtered') {
      newStatus = 'filtered';
      filteredCount++;
    } else if (result.decision === 'needs_review') {
      newStatus = 'needs_review';
      needsReviewCount++;
    } else {
      newStatus = 'scored';
      passedCount++;
    }

    repository.updateJobFilterStatus(job.id!, newStatus, result.reasons);
    audit.recordAuditEvent('POLICY_FILTER_APPLIED', job.id!, job.canonicalUrl, {
      decision: result.decision,
      reasons: result.reasons,
    });
  }

  console.log(`[FILTER] Filtering complete. Evaluated: ${totalEvaluated}, Filtered out: ${filteredCount}, Needs review: ${needsReviewCount}, Passed: ${passedCount}`);
  return { totalEvaluated, filteredCount, needsReviewCount, passedCount };
}
