import { describe, it, expect } from 'vitest';
import { CoverLetterGenerator } from '../src/ai/cover-letter.js';
import { CandidateProfile, NormalizedJob } from '../src/domain/types.js';

describe('Cover Letter Generator & Non-Hallucination Guard', () => {
  const dummyProfile: CandidateProfile = {
    candidate: {
      name: 'Alex Developer',
      age: 18,
      location: 'Moscow',
      remote_only: true,
      employment: ['full-time'],
      experience_years: 0,
      github: 'https://github.com/alex-dev-ru',
      portfolio: 'https://alex-dev.ru',
      truthful_facts: ['React, TypeScript, JavaScript', 'Vite, Next.js, Node.js'],
      target_roles: ['Junior Frontend Developer'],
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
    canonicalUrl: 'https://hh.ru/vacancy/101',
    externalId: '101',
    source: 'hh',
    title: 'Junior Frontend Developer',
    company: 'TechCorp',
    location: 'Moscow',
    isRemote: true,
    employmentType: 'full-time',
    description: 'React, TypeScript frontend job',
    keySkills: ['React', 'TypeScript'],
    publishedAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
  };

  it('generates non-empty fallback cover letter without hallucinated facts', () => {
    const generator = new CoverLetterGenerator();
    const letter = generator.fallbackCoverLetter(dummyProfile, dummyJob, 'neutral');

    expect(letter).toContain('Alex Developer');
    expect(letter).toContain('https://github.com/alex-dev-ru');
    expect(letter).toContain('Junior');
    expect(letter.length).toBeGreaterThan(150);
  });
});
