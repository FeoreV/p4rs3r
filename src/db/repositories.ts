import { DatabaseSync } from 'node:sqlite';
import { NormalizedJob, ApplicationQueueItem, ScoringResult, QueueStatus } from '../domain/types.js';
import { generateDedupeHash } from '../domain/dedupe.js';

export class JobRepository {
  constructor(private db: DatabaseSync) {}

  public isDuplicate(source: string, externalId: string, canonicalUrl: string): boolean {
    const dedupeHash = generateDedupeHash(source, externalId, canonicalUrl);
    const stmt = this.db.prepare('SELECT id FROM vacancies WHERE dedupe_hash = ?');
    const existing = stmt.get(dedupeHash);
    return !!existing;
  }

  public saveVacancy(job: NormalizedJob): number {
    const dedupeHash = generateDedupeHash(job.source, job.externalId, job.canonicalUrl);
    const stmtExisting = this.db.prepare('SELECT id FROM vacancies WHERE dedupe_hash = ?');
    const existing: any = stmtExisting.get(dedupeHash);

    if (existing) {
      return Number(existing.id);
    }

    const stmtInsert = this.db.prepare(`
      INSERT INTO vacancies (
        dedupe_hash, canonical_url, external_id, source, title, company,
        salary_min, salary_max, salary_currency, location, is_remote,
        employment_type, description, key_skills, published_at, first_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmtInsert.run(
      dedupeHash,
      job.canonicalUrl,
      job.externalId,
      job.source,
      job.title,
      job.company,
      job.salaryMin ?? null,
      job.salaryMax ?? null,
      job.salaryCurrency ?? null,
      job.location,
      job.isRemote ? 1 : 0,
      job.employmentType,
      job.description,
      JSON.stringify(job.keySkills),
      job.publishedAt,
      job.firstSeenAt
    );

    const stmtLastId = this.db.prepare('SELECT last_insert_rowid() as id');
    const lastIdRow: any = stmtLastId.get();
    return Number(lastIdRow.id);
  }

  public getAllVacancies(): NormalizedJob[] {
    const stmt = this.db.prepare('SELECT * FROM vacancies');
    const rows: any[] = stmt.all();
    return rows.map((r) => ({
      id: Number(r.id),
      canonicalUrl: r.canonical_url,
      externalId: r.external_id,
      source: r.source,
      title: r.title,
      company: r.company,
      salaryMin: r.salary_min != null ? Number(r.salary_min) : undefined,
      salaryMax: r.salary_max != null ? Number(r.salary_max) : undefined,
      salaryCurrency: r.salary_currency ?? undefined,
      location: r.location,
      isRemote: Boolean(r.is_remote),
      employmentType: r.employment_type,
      description: r.description,
      keySkills: JSON.parse(r.key_skills || '[]'),
      publishedAt: r.published_at,
      firstSeenAt: r.first_seen_at,
    }));
  }

  public getUnscoredVacancies(): NormalizedJob[] {
    const stmtScored = this.db.prepare('SELECT job_id FROM applications_queue');
    const scoredRows: any[] = stmtScored.all();
    const scoredIds = new Set(scoredRows.map((r) => Number(r.job_id)));

    const all = this.getAllVacancies();
    return all.filter((job) => !scoredIds.has(job.id!));
  }

  public saveQueueItem(item: ApplicationQueueItem): number {
    const stmt = this.db.prepare(`
      INSERT INTO applications_queue (
        job_id, status, score, scoring_result, cover_letter_tone, cover_letter_text,
        screenshot_path, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      item.jobId,
      item.status,
      item.score,
      JSON.stringify(item.scoringResult),
      item.coverLetterTone ?? null,
      item.coverLetterText ?? null,
      item.screenshotPath ?? null,
      item.errorMessage ?? null,
      item.createdAt,
      item.updatedAt
    );

    const stmtLastId = this.db.prepare('SELECT last_insert_rowid() as id');
    const lastIdRow: any = stmtLastId.get();
    return Number(lastIdRow.id);
  }

  public updateQueueStatus(queueId: number, status: QueueStatus, extra?: { screenshotPath?: string; errorMessage?: string }): void {
    const now = new Date().toISOString();
    let query = 'UPDATE applications_queue SET status = ?, updated_at = ?';
    const params: any[] = [status, now];

    if (extra?.screenshotPath) {
      query += ', screenshot_path = ?';
      params.push(extra.screenshotPath);
    }
    if (extra?.errorMessage) {
      query += ', error_message = ?';
      params.push(extra.errorMessage);
    }

    query += ' WHERE id = ?';
    params.push(queueId);

    const stmt = this.db.prepare(query);
    stmt.run(...params);
  }

  public getQueueByStatus(status: QueueStatus): ApplicationQueueItem[] {
    const stmt = this.db.prepare('SELECT * FROM applications_queue WHERE status = ?');
    const rows: any[] = stmt.all(status);
    return rows.map((r) => ({
      id: Number(r.id),
      jobId: Number(r.job_id),
      status: r.status as QueueStatus,
      score: Number(r.score),
      scoringResult: JSON.parse(r.scoring_result || '{}'),
      coverLetterTone: r.cover_letter_tone ?? undefined,
      coverLetterText: r.cover_letter_text ?? undefined,
      screenshotPath: r.screenshot_path ?? undefined,
      errorMessage: r.error_message ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public getDailyAppliedCount(isoDatePrefix: string): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as cnt FROM applications_queue WHERE status = 'applied' AND updated_at >= ?");
    const row: any = stmt.get(isoDatePrefix);
    return Number(row?.cnt ?? 0);
  }

  public logAudit(action: string, jobId?: number, jobUrl?: string, details?: Record<string, any>): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (action, job_id, job_url, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      action,
      jobId ?? null,
      jobUrl ?? null,
      details ? JSON.stringify(details) : null,
      new Date().toISOString()
    );
  }

  public purgePendingQueue(): number {
    const stmtCount = this.db.prepare("SELECT COUNT(*) as cnt FROM applications_queue WHERE status IN ('recommended', 'needs_review')");
    const countRow: any = stmtCount.get();
    const count = Number(countRow?.cnt ?? 0);

    const stmtDelete = this.db.prepare("DELETE FROM applications_queue WHERE status IN ('recommended', 'needs_review')");
    stmtDelete.run();

    return count;
  }
}
