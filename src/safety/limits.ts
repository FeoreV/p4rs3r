import { PolicyConfig } from '../domain/types.js';
import { JobRepository } from '../db/repositories.js';

export class SafetyLimitGuard {
  private panicStateLocked = false;

  constructor(private repository: JobRepository, private policy: PolicyConfig) {}

  public isPanicLocked(): boolean {
    return this.panicStateLocked;
  }

  public enablePanicStop(): void {
    this.panicStateLocked = true;
    this.repository.logAudit('PANIC_STOP_TRIGGERED', undefined, undefined, {
      message: 'Panic stop activated. Auto-apply disabled and pending queues purged.',
    });
    this.repository.purgePendingQueue();
  }

  public checkApplicationQuotas(currentRunCount: number): { allowed: boolean; reason?: string } {
    if (this.panicStateLocked) {
      return { allowed: false, reason: 'Panic stop is active' };
    }

    if (currentRunCount >= this.policy.max_applications_per_run) {
      return { allowed: false, reason: `Reached per-run application limit (${this.policy.max_applications_per_run})` };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyApplied = this.repository.getDailyAppliedCount(todayStr);

    if (dailyApplied >= this.policy.max_applications_per_day) {
      return { allowed: false, reason: `Reached daily application limit (${this.policy.max_applications_per_day})` };
    }

    return { allowed: true };
  }
}
