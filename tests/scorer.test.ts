import { describe, it, expect } from 'vitest';
import { LLMScorer } from '../src/ai/scorer.js';
import { CandidateProfile, NormalizedJob } from '../src/domain/types.js';

describe('LLM Scorer & Schema Validation', () => {
  const dummyProfile: CandidateProfile = {
    candidate: {
      name: 'Alex',
      age: 18,
      location: 'Moscow',
      remote_only: true,
      employment: ['full-time'],
      experience_years: 0,
      github: 'https://github.com/alex-dev',
      portfolio: '',
      truthful_facts: ['React, TypeScript'],
      target_roles: ['Junior Frontend'],
      target_salary_rub: 80000,
      languages: { russian: 'native' },
      no_go: ['unpaid full-time internship'],
    },
    policy: {
      min_score: 70,
      review_score: 55,
      max_applications_per_run: 5,
      max_applications_per_day: 10,
      auto_apply: false,
      require_confirmation_for_first_run: true,
      never_answer_unknown_questions: true,
      never_invent_facts: true,
      never_bypass_captcha: true,
    },
  };

  const dummyJob: NormalizedJob = {
    canonicalUrl: 'https://hh.ru/vacancy/1234',
    externalId: '1234',
    source: 'hh',
    title: 'Junior React Developer',
    company: 'Test Co',
    location: 'Moscow',
    isRemote: true,
    employmentType: 'full-time',
    description: 'Developing React frontend apps with TypeScript',
    keySkills: ['React', 'TypeScript'],
    publishedAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
  };

  it('uses fallback heuristic gracefully on LLM error', async () => {
    const mockLLM = {
      completeJSON: async () => {
        throw new Error('LLM unavailable');
      },
    } as any;

    const scorer = new LLMScorer(mockLLM);
    const result = await scorer.scoreJob(dummyProfile, dummyJob);

    expect(result.score).toBeGreaterThan(0);
    expect(result.recommendation).toBeDefined();
    expect(result.reasons[0]).toContain('Fallback heuristic');
  });
});
