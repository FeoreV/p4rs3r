import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyLimitGuard } from '../src/safety/limits.js';
import { JobRepository } from '../src/db/repositories.js';
import { getDatabase } from '../src/db/client.js';

describe('Safety Limits Guard', () => {
  let repo: JobRepository;
  let guard: SafetyLimitGuard;

  beforeEach(() => {
    const { db } = getDatabase(':memory:');
    repo = new JobRepository(db);
    guard = new SafetyLimitGuard(repo, {
      min_score: 70,
      review_score: 55,
      max_applications_per_run: 2,
      max_applications_per_day: 5,
      auto_apply: false,
      require_confirmation_for_first_run: true,
      never_answer_unknown_questions: true,
      never_invent_facts: true,
      never_bypass_captcha: true,
    });
  });

  it('blocks when per-run quota is exceeded', () => {
    const check1 = guard.checkApplicationQuotas(1);
    expect(check1.allowed).toBe(true);

    const check2 = guard.checkApplicationQuotas(2);
    expect(check2.allowed).toBe(false);
    expect(check2.reason).toContain('per-run');
  });

  it('locks execution when panic stop is activated', () => {
    guard.enablePanicStop();
    expect(guard.isPanicLocked()).toBe(true);
    const check = guard.checkApplicationQuotas(0);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Panic stop');
  });
});
