import { describe, it, expect } from 'vitest';
import { getDatabase } from '../src/db/client.js';
import { JobRepository } from '../src/db/repositories.js';
import { SafetyLimitGuard } from '../src/safety/limits.js';
import { loadProfileConfig } from '../src/application/scan.js';

describe('Panic Stop Persistence', () => {
  it('persists panic stop status in DB system_state across new repository instances', () => {
    const { db } = getDatabase(':memory:');
    const repo1 = new JobRepository(db);
    const profile = loadProfileConfig();

    const guard1 = new SafetyLimitGuard(repo1, profile.policy);
    expect(guard1.isPanicLocked()).toBe(false);

    guard1.enablePanicStop();
    expect(guard1.isPanicLocked()).toBe(true);

    // Create a second repository instance on the same database connection
    const repo2 = new JobRepository(db);
    const guard2 = new SafetyLimitGuard(repo2, profile.policy);

    expect(guard2.isPanicLocked()).toBe(true);
    expect(guard2.checkApplicationQuotas(0).allowed).toBe(false);
  });
});
