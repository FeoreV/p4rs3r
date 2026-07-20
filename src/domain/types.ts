import { z } from 'zod';

export type JobStatus =
  | 'discovered'
  | 'filtered'
  | 'scored'
  | 'needs_review'
  | 'approved'
  | 'draft'
  | 'submitted'
  | 'failed'
  | 'unknown'
  | 'recommended'
  | 'rejected'
  | 'applied';

export type QueueStatus = JobStatus;

export type AuthStatus = 'authenticated' | 'not_authenticated' | 'blocked' | 'unknown';

export interface CandidateProfile {
  candidate: {
    name: string;
    age: number;
    location: string;
    remote_only: boolean;
    employment: string[];
    experience_years: number;
    github: string;
    portfolio: string;
    truthful_facts: string[];
    target_roles: string[];
    target_salary_rub: number;
    languages: Record<string, string>;
    no_go: string[];
  };
  policy: PolicyConfig;
}

export interface PolicyConfig {
  min_score: number;
  review_score: number;
  max_applications_per_run: number;
  max_applications_per_day: number;
  auto_apply: boolean;
  require_confirmation_for_first_run: boolean;
  never_answer_unknown_questions: boolean;
  never_invent_facts: boolean;
  never_bypass_captcha: boolean;
}

export interface RawJob {
  source: string;
  externalId: string;
  title: string;
  company: string;
  companyUrl?: string;
  url: string;
  salaryText?: string;
  location?: string;
  areaId?: number;
  isRemote?: boolean;
  employmentType?: string;
  schedule?: string;
  experience?: string;
  publishedAt?: string;
  rawPayload?: Record<string, any>;
}

export interface JobDetails extends RawJob {
  description: string;
  requirements?: string[];
  responsibilities?: string[];
  keySkills?: string[];
  mandatoryQuestions?: string[];
}

export interface NormalizedJob {
  id?: number;
  canonicalUrl: string;
  externalId: string;
  source: string;
  title: string;
  company: string;
  companyUrl?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryFrom?: number;
  salaryTo?: number;
  currency?: string;
  location: string;
  areaId?: number;
  isRemote: boolean;
  remote?: boolean;
  employmentType: string;
  schedule?: string;
  experience?: string;
  description: string;
  keySkills: string[];
  publishedAt: string;
  firstSeenAt: string;
  fetchedAt?: string;
  updatedAt?: string;
  alternateUrl?: string;
  rawPayloadHash?: string;
  rawPayloadPath?: string;
  sourceMetadata?: string;
  status?: JobStatus;
}

export interface PolicyFilterReason {
  code: string;
  message: string;
}

export interface PolicyFilterResult {
  decision: 'passed' | 'filtered' | 'needs_review';
  reasons: PolicyFilterReason[];
}

export const ScoringResultSchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: z.enum(['apply', 'review', 'reject']),
  skill_match: z.number().min(0).max(100),
  seniority_match: z.number().min(0).max(100),
  format_match: z.number().min(0).max(100),
  salary_match: z.number().min(0).max(100),
  growth_signal: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  missing_requirements: z.array(z.string()),
  red_flags: z.array(z.string()),
  questions_to_verify: z.array(z.string()),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

export interface ApplicationQueueItem {
  id?: number;
  jobId: number;
  status: QueueStatus;
  score: number;
  scoringResult: ScoringResult;
  coverLetterTone?: 'neutral' | 'direct' | 'warm';
  coverLetterText?: string;
  screenshotPath?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchQuery {
  profileName?: string;
  keywords: string[];
  area?: number;
  page?: number;
  pages?: number;
  perPage?: number;
  schedule?: string;
  remoteOnly?: boolean;
  since?: string;
  limit?: number;
  noDetails?: boolean;
}

export interface ScanOptions {
  sources?: string[];
  query?: string;
  area?: number;
  page?: number;
  pages?: number;
  perPage?: number;
  remoteOnly?: boolean;
  since?: string;
  limit?: number;
  noDetails?: boolean;
  json?: boolean;
}

export interface SourceCapabilities {
  search: boolean;
  details: boolean;
  apply: boolean;
}

export interface JobSource {
  name: string;
  search(query: SearchQuery): Promise<RawJob[]>;
  getDetails(job: RawJob): Promise<JobDetails>;
  capabilities(): SourceCapabilities;
}


