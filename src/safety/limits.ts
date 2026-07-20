import { PolicyConfig } from '../domain/types.js';
import { JobRepository } from '../db/repositories.js';

export class SafetyLimitGuard {
  constructor(private repository: JobRepository, private policy: PolicyConfig) {}

  public isPanicLocked(): boolean {
    return this.repository.getPanicLock();
  }

  public enablePanicStop(): void {
    this.repository.setPanicLock(true);
    this.repository.logAudit('PANIC_STOP_TRIGGERED', undefined, undefined, {
      message: 'Panic stop activated. Auto-apply disabled and pending queues purged.',
    });
    this.repository.purgePendingQueue();
  }

  public disablePanicStop(): void {
    this.repository.setPanicLock(false);
  }

  public checkApplicationQuotas(currentRunCount: number): { allowed: boolean; reason?: string } {
    if (this.isPanicLocked()) {
      return { allowed: false, reason: 'Panic stop is active' };
    }

    if (currentRunCount >= this.policy.max_applications_per_run) {
      return { allowed: false, reason: `Reached per-run application limit (${this.policy.max_applications_per_run})` };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyApplied = this.repository.getDailyApplicationCount(todayStr);

    if (dailyApplied >= this.policy.max_applications_per_day) {
      return { allowed: false, reason: `Reached daily application limit (${this.policy.max_applications_per_day})` };
    }

    return { allowed: true };
  }
}
