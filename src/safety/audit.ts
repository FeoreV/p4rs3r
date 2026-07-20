import { JobRepository } from '../db/repositories.js';

export class AuditLogger {
  constructor(private repository: JobRepository) {}

  public recordScanStart(sources: string[]): void {
    this.repository.logAudit('SCAN_START', undefined, undefined, { sources });
  }

  public recordScanComplete(foundCount: number, insertedCount: number): void {
    this.repository.logAudit('SCAN_COMPLETE', undefined, undefined, { foundCount, insertedCount });
  }

  public recordScoring(jobId: number, score: number, recommendation: string): void {
    this.repository.logAudit('JOB_SCORED', jobId, undefined, { score, recommendation });
  }

  public recordApplicationSubmitted(jobId: number, jobUrl: string, mode: string, coverLetter: string): void {
    this.repository.logAudit('APPLICATION_SUBMITTED', jobId, jobUrl, { mode, coverLetter });
  }

  public recordApplicationFailed(jobId: number, jobUrl: string, error: string): void {
    this.repository.logAudit('APPLICATION_FAILED', jobId, jobUrl, { error });
  }

  public recordPanicStop(): void {
    this.repository.logAudit('PANIC_STOP_ACTIVATED', undefined, undefined, { timestamp: new Date().toISOString() });
  }

  public recordAuditEvent(action: string, jobId?: number, jobUrl?: string, details?: Record<string, any>): void {
    this.repository.recordAuditEvent(action, jobId, jobUrl, details);
  }
}
