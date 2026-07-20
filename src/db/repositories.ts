import { DatabaseSync } from 'node:sqlite';
import { NormalizedJob, ApplicationQueueItem, ScoringResult, QueueStatus, JobStatus } from '../domain/types.js';
import { generateDedupeHash } from '../domain/dedupe.js';

export class JobRepository {
  constructor(private db: DatabaseSync) {}

  public isDuplicate(source: string, externalId: string, canonicalUrl: string): boolean {
    const dedupeHash = generateDedupeHash(source, externalId, canonicalUrl);
    const stmtJobs = this.db.prepare('SELECT id FROM jobs WHERE source = ? AND external_id = ? OR canonical_url = ?');
    const existingJob = stmtJobs.get(source, externalId, canonicalUrl);
    if (existingJob) return true;

    const stmtVacancies = this.db.prepare('SELECT id FROM vacancies WHERE dedupe_hash = ?');
    const existingVacancy = stmtVacancies.get(dedupeHash);
    return !!existingVacancy;
  }

  public upsertJob(job: NormalizedJob): number {
    const dedupeHash = generateDedupeHash(job.source, job.externalId, job.canonicalUrl);
    const now = new Date().toISOString();
    const rawHash = job.rawPayloadHash || dedupeHash;
    const status: JobStatus = job.status || 'discovered';

    // Check existing in jobs table
    const stmtExisting = this.db.prepare('SELECT id FROM jobs WHERE (source = ? AND external_id = ?) OR canonical_url = ?');
    const existing: any = stmtExisting.get(job.source, job.externalId, job.canonicalUrl);

    if (existing) {
      const jobId = Number(existing.id);
      const stmtUpdate = this.db.prepare(`
        UPDATE jobs SET title = ?, company = ?, company_url = ?, description = ?, location = ?, area_id = ?, remote = ?,
        salary_from = ?, salary_to = ?, currency = ?, employment_type = ?, schedule = ?, experience = ?, key_skills = ?,
        published_at = ?, fetched_at = ?, updated_at = ?, alternate_url = ?, raw_payload_hash = ?, raw_payload_path = ?,
        source_metadata = ?, status = ? WHERE id = ?
      `);
      stmtUpdate.run(
        job.title,
        job.company,
        job.companyUrl ?? null,
        job.description,
        job.location,
        job.areaId ?? null,
        job.isRemote || job.remote ? 1 : 0,
        job.salaryFrom ?? job.salaryMin ?? null,
        job.salaryTo ?? job.salaryMax ?? null,
        job.currency ?? job.salaryCurrency ?? null,
        job.employmentType,
        job.schedule ?? null,
        job.experience ?? null,
        JSON.stringify(job.keySkills),
        job.publishedAt,
        now,
        now,
        job.alternateUrl ?? null,
        rawHash,
        job.rawPayloadPath ?? null,
        job.sourceMetadata ?? null,
        status,
        jobId
      );
      this.updateVacancyRecord({ ...job, id: jobId });
      return jobId;
    }

    const stmtInsert = this.db.prepare(`
      INSERT INTO jobs (
        source, external_id, canonical_url, title, company, company_url, description, location, area_id, remote,
        salary_from, salary_to, currency, employment_type, schedule, experience, key_skills, published_at, fetched_at,
        updated_at, alternate_url, raw_payload_hash, raw_payload_path, source_metadata, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmtInsert.run(
      job.source,
      job.externalId,
      job.canonicalUrl,
      job.title,
      job.company,
      job.companyUrl ?? null,
      job.description,
      job.location,
      job.areaId ?? null,
      job.isRemote || job.remote ? 1 : 0,
      job.salaryFrom ?? job.salaryMin ?? null,
      job.salaryTo ?? job.salaryMax ?? null,
      job.currency ?? job.salaryCurrency ?? null,
      job.employmentType,
      job.schedule ?? null,
      job.experience ?? null,
      JSON.stringify(job.keySkills),
      job.publishedAt,
      now,
      now,
      job.alternateUrl ?? null,
      rawHash,
      job.rawPayloadPath ?? null,
      job.sourceMetadata ?? null,
      status
    );

    const stmtLastId = this.db.prepare('SELECT last_insert_rowid() as id');
    const lastIdRow: any = stmtLastId.get();
    const newId = Number(lastIdRow.id);

    this.saveVacancy({ ...job, id: newId });
    return newId;
  }

  public updateVacancyRecord(job: NormalizedJob): void {
    const now = new Date().toISOString();
    const stmtUpdate = this.db.prepare(`
      UPDATE vacancies SET title = ?, company = ?, company_url = ?, description = ?, location = ?, area_id = ?,
      is_remote = ?, salary_min = ?, salary_max = ?, salary_currency = ?, employment_type = ?, schedule = ?,
      experience = ?, key_skills = ?, published_at = ?, updated_at = ?, alternate_url = ?, raw_payload_path = ?,
      source_metadata = ?, status = ? WHERE canonical_url = ? OR (source = ? AND external_id = ?)
    `);
    stmtUpdate.run(
      job.title,
      job.company,
      job.companyUrl ?? null,
      job.description,
      job.location,
      job.areaId ?? null,
      job.isRemote || job.remote ? 1 : 0,
      job.salaryFrom ?? job.salaryMin ?? null,
      job.salaryTo ?? job.salaryMax ?? null,
      job.currency ?? job.salaryCurrency ?? null,
      job.employmentType,
      job.schedule ?? null,
      job.experience ?? null,
      JSON.stringify(job.keySkills),
      job.publishedAt,
      now,
      job.alternateUrl ?? null,
      job.rawPayloadPath ?? null,
      job.sourceMetadata ?? null,
      job.status || 'discovered',
      job.canonicalUrl,
      job.source,
      job.externalId
    );
  }

  public saveVacancy(job: NormalizedJob): number {
    const dedupeHash = generateDedupeHash(job.source, job.externalId, job.canonicalUrl);
    const stmtExisting = this.db.prepare('SELECT id FROM vacancies WHERE dedupe_hash = ?');
    const existing: any = stmtExisting.get(dedupeHash);

    if (existing) {
      this.updateVacancyRecord(job);
      return Number(existing.id);
    }

    const stmtInsert = this.db.prepare(`
      INSERT INTO vacancies (
        dedupe_hash, canonical_url, external_id, source, title, company, company_url,
        salary_min, salary_max, salary_currency, location, area_id, is_remote,
        employment_type, schedule, experience, description, key_skills, published_at, first_seen_at,
        updated_at, alternate_url, raw_payload_path, source_metadata, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmtInsert.run(
      dedupeHash,
      job.canonicalUrl,
      job.externalId,
      job.source,
      job.title,
      job.company,
      job.companyUrl ?? null,
      job.salaryFrom ?? job.salaryMin ?? null,
      job.salaryTo ?? job.salaryMax ?? null,
      job.currency ?? job.salaryCurrency ?? null,
      job.location,
      job.areaId ?? null,
      job.isRemote || job.remote ? 1 : 0,
      job.employmentType,
      job.schedule ?? null,
      job.experience ?? null,
      job.description,
      JSON.stringify(job.keySkills),
      job.publishedAt,
      job.firstSeenAt || new Date().toISOString(),
      new Date().toISOString(),
      job.alternateUrl ?? null,
      job.rawPayloadPath ?? null,
      job.sourceMetadata ?? null,
      job.status || 'discovered'
    );

    const stmtLastId = this.db.prepare('SELECT last_insert_rowid() as id');
    const lastIdRow: any = stmtLastId.get();
    return Number(lastIdRow.id);
  }

  public updateJobFilterStatus(jobId: number, status: JobStatus, reasons: any[]): void {
    const now = new Date().toISOString();
    const reasonsJson = JSON.stringify(reasons);
    const stmt1 = this.db.prepare('UPDATE jobs SET status = ?, filter_reasons = ?, fetched_at = ? WHERE id = ?');
    stmt1.run(status, reasonsJson, now, jobId);

    const stmt2 = this.db.prepare('UPDATE vacancies SET status = ?, filter_reasons = ?, updated_at = ? WHERE id = ?');
    stmt2.run(status, reasonsJson, now, jobId);
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
      companyUrl: r.company_url ?? undefined,
      salaryMin: r.salary_min != null ? Number(r.salary_min) : undefined,
      salaryMax: r.salary_max != null ? Number(r.salary_max) : undefined,
      salaryCurrency: r.salary_currency ?? undefined,
      salaryFrom: r.salary_min != null ? Number(r.salary_min) : undefined,
      salaryTo: r.salary_max != null ? Number(r.salary_max) : undefined,
      currency: r.salary_currency ?? undefined,
      location: r.location,
      areaId: r.area_id != null ? Number(r.area_id) : undefined,
      isRemote: Boolean(r.is_remote),
      remote: Boolean(r.is_remote),
      employmentType: r.employment_type,
      schedule: r.schedule ?? undefined,
      experience: r.experience ?? undefined,
      description: r.description,
      keySkills: JSON.parse(r.key_skills || '[]'),
      publishedAt: r.published_at,
      firstSeenAt: r.first_seen_at,
      updatedAt: r.updated_at ?? undefined,
      alternateUrl: r.alternate_url ?? undefined,
      rawPayloadPath: r.raw_payload_path ?? undefined,
      sourceMetadata: r.source_metadata ?? undefined,
      status: (r.status as JobStatus) || 'discovered',
    }));
  }

  public setAuthStatus(source: string, status: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(`auth_status_${source}`, status, new Date().toISOString());
  }

  public getAuthStatus(source: string): string {
    const stmt = this.db.prepare('SELECT value FROM system_state WHERE key = ?');
    const row: any = stmt.get(`auth_status_${source}`);
    return row?.value || 'unknown';
  }


  public getUnscoredJobs(): NormalizedJob[] {
    return this.getUnscoredVacancies();
  }

  public getUnscoredVacancies(): NormalizedJob[] {
    const stmtScored = this.db.prepare('SELECT job_id FROM applications_queue');
    const scoredRows: any[] = stmtScored.all();
    const scoredIds = new Set(scoredRows.map((r) => Number(r.job_id)));

    const all = this.getAllVacancies();
    return all.filter((job) => !scoredIds.has(job.id!));
  }

  public saveScore(jobId: number, scoringResult: ScoringResult): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO scores (job_id, score, recommendation, scoring_result, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(jobId, scoringResult.score, scoringResult.recommendation, JSON.stringify(scoringResult), now);

    const stmtLastId = this.db.prepare('SELECT last_insert_rowid() as id');
    const lastIdRow: any = stmtLastId.get();
    return Number(lastIdRow.id);
  }

  public createApplicationDraft(jobId: number, coverLetterText: string, tone: 'neutral' | 'direct' | 'warm' = 'neutral'): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO applications (job_id, status, cover_letter_tone, cover_letter_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(jobId, 'draft', tone, coverLetterText, now, now);

    const stmtLastId = this.db.prepare('SELECT last_insert_rowid() as id');
    const lastIdRow: any = stmtLastId.get();
    return Number(lastIdRow.id);
  }

  public getPendingApplications(): ApplicationQueueItem[] {
    const recommended = this.getQueueByStatus('recommended');
    const review = this.getQueueByStatus('needs_review');
    return [...recommended, ...review];
  }

  public recordAuditEvent(action: string, jobId?: number, jobUrl?: string, details?: Record<string, any>): void {
    this.logAudit(action, jobId, jobUrl, details);
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (action, job_id, job_url, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(action, jobId ?? null, jobUrl ?? null, details ? JSON.stringify(details) : null, new Date().toISOString());
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
    const stmt = this.db.prepare("SELECT COUNT(*) as cnt FROM applications_queue WHERE status IN ('applied', 'submitted') AND updated_at >= ?");
    const row: any = stmt.get(isoDatePrefix);
    return Number(row?.cnt ?? 0);
  }

  public getDailyApplicationCount(isoDatePrefix: string): number {
    return this.getDailyAppliedCount(isoDatePrefix);
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

  public generateRunSummary(): { totalVacancies: number; recommended: number; review: number; applied: number; failed: number } {
    const vacancies = this.getAllVacancies();
    const recommended = this.getQueueByStatus('recommended');
    const review = this.getQueueByStatus('needs_review');
    const applied = [...this.getQueueByStatus('applied'), ...this.getQueueByStatus('submitted')];
    const failed = this.getQueueByStatus('failed');
    return {
      totalVacancies: vacancies.length,
      recommended: recommended.length,
      review: review.length,
      applied: applied.length,
      failed: failed.length,
    };
  }

  public setPanicLock(locked: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO system_state (key, value, updated_at) VALUES ('panic_lock', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(locked ? 'true' : 'false', new Date().toISOString());
  }

  public getPanicLock(): boolean {
    const stmt = this.db.prepare("SELECT value FROM system_state WHERE key = 'panic_lock'");
    const row: any = stmt.get();
    return row?.value === 'true';
  }
}

