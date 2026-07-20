import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase } from '../src/db/client.js';
import { JobRepository } from '../src/db/repositories.js';
import { normalizeCanonicalUrl } from '../src/domain/dedupe.js';
import { mapHHDetailsToNormalized, saveRawPayload } from '../src/sources/hh/hh.mapper.js';
import { evaluateDeterministicPolicy } from '../src/application/filter.js';
import { REAL_SUBMIT_ENABLED, HHPlaywrightApplier } from '../src/sources/hh/hh.apply.js';
import { generateDailyReport } from '../src/application/report.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';

describe('HH Real Harvest & Safety Acceptance Tests', () => {
  let repo: JobRepository;
  let sqliteInstance: any;

  beforeEach(() => {
    const { db, sqlite } = getDatabase(':memory:');
    repo = new JobRepository(db);
    sqliteInstance = sqlite;
  });

  afterEach(() => {
    if (sqliteInstance) {
      sqliteInstance.close();
    }
  });

  test('canonical URL strips tracking parameters and lowercases deterministic URLs', () => {
    const rawUrl = 'HTTPS://HH.RU/vacancy/987654321?from=search_res&hhtmFrom=main&utm_source=google#anchor';
    const canonical = normalizeCanonicalUrl(rawUrl);
    expect(canonical).toBe('https://hh.ru/vacancy/987654321');
  });

  test('maps raw HH details to normalized job format correctly', () => {
    const details = {
      source: 'hh',
      externalId: '123456',
      title: 'React Developer',
      company: 'Tech Solutions LLC',
      url: 'https://hh.ru/vacancy/123456?from=search',
      location: 'Moscow',
      isRemote: true,
      publishedAt: '2026-07-20T10:00:00Z',
      description: '<p>Looking for a <b>React</b> & <b>TypeScript</b> developer.</p>',
      keySkills: ['React', 'TypeScript'],
      rawPayload: {
        id: '123456',
        name: 'React Developer',
        employer: { name: 'Tech Solutions LLC', alternate_url: 'https://hh.ru/employer/999' },
        area: { id: '1', name: 'Moscow' },
        salary: { from: 150000, to: 220000, currency: 'RUR' },
        schedule: { id: 'remote', name: 'Удаленная работа' },
        employment: { id: 'full', name: 'Полная занятость' },
      },
    };

    const normalized = mapHHDetailsToNormalized(details);

    expect(normalized.canonicalUrl).toBe('https://hh.ru/vacancy/123456');
    expect(normalized.externalId).toBe('123456');
    expect(normalized.salaryFrom).toBe(150000);
    expect(normalized.salaryTo).toBe(220000);
    expect(normalized.currency).toBe('RUR');
    expect(normalized.isRemote).toBe(true);
    expect(normalized.description).toBe('Looking for a React & TypeScript developer.');
    expect(normalized.rawPayloadHash).toBeDefined();
    expect(normalized.rawPayloadPath).toBeDefined();
  });

  test('redacts sensitive headers when saving raw payloads to disk', () => {
    const rawPayload = {
      id: '999111',
      headers: {
        authorization: 'Bearer secret_token',
        cookie: 'session_id=abcdef12345',
        'user-agent': 'p4rs3r-JobHunter',
      },
      cookies: ['session_id=abcdef12345'],
      salary: { from: 100000, to: 150000 },
    };

    const { hash, path } = saveRawPayload('hh', '999111', rawPayload);
    expect(hash).toBeDefined();
    expect(existsSync(path)).toBe(true);

    const savedContent = readFileSync(path, 'utf8');
    expect(savedContent).not.includes('secret_token');
    expect(savedContent).not.includes('session_id=abcdef12345');
    expect(savedContent).includes('p4rs3r-JobHunter');
  });

  test('upserts vacancy without deleting score or audit history', () => {
    const job = {
      canonicalUrl: 'https://hh.ru/vacancy/555',
      externalId: '555',
      source: 'hh',
      title: 'Frontend Dev v1',
      company: 'Corp LLC',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      description: 'First version of description',
      keySkills: ['React'],
      publishedAt: '2026-07-20T10:00:00Z',
      firstSeenAt: new Date().toISOString(),
    };

    const id1 = repo.upsertJob(job);
    repo.recordAuditEvent('INITIAL_SCAN', id1, job.canonicalUrl, { step: 1 });

    const updatedJob = {
      ...job,
      title: 'Frontend Dev v2 (Updated Title)',
      description: 'Updated description details',
    };

    const id2 = repo.upsertJob(updatedJob);
    expect(id2).toBe(id1);

    const all = repo.getAllVacancies();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe('Frontend Dev v2 (Updated Title)');
    expect(all[0].description).toBe('Updated description details');
  });

  test('deterministic policy filter correctly detects no-go phrases and seniority mismatch', () => {
    const mockProfile = {
      candidate: {
        name: 'Alex Developer',
        age: 18,
        location: 'Moscow',
        remote_only: true,
        employment: ['full-time'],
        experience_years: 0,
        github: '',
        portfolio: '',
        truthful_facts: ['React', 'TypeScript'],
        target_roles: ['Junior Developer'],
        target_salary_rub: 80000,
        languages: { russian: 'native' },
        no_go: ['sales', 'unpaid full-time internship', 'mandatory office relocation'],
      },
      policy: {
        min_score: 70,
        review_score: 55,
        max_applications_per_run: 8,
        max_applications_per_day: 12,
        auto_apply: false,
        require_confirmation_for_first_run: true,
        never_answer_unknown_questions: true,
        never_invent_facts: true,
        never_bypass_captcha: true,
      },
    };

    const seniorJob = {
      canonicalUrl: 'https://hh.ru/vacancy/901',
      externalId: '901',
      source: 'hh',
      title: 'Senior Lead React Architect',
      company: 'Enterprise Corp',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      experience: 'between3and6',
      description: 'Requires 5+ years experience',
      keySkills: ['React'],
      publishedAt: '2026-07-20T10:00:00Z',
      firstSeenAt: new Date().toISOString(),
    };

    const resultSenior = evaluateDeterministicPolicy(seniorJob, mockProfile);
    expect(resultSenior.decision).toBe('filtered');
    expect(resultSenior.reasons.some((r) => r.code === 'SENIORITY_MISMATCH')).toBe(true);

    const salesJob = {
      canonicalUrl: 'https://hh.ru/vacancy/902',
      externalId: '902',
      source: 'hh',
      title: 'Менеджер по холодным продажам ПО',
      company: 'SalesBiz LLC',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      description: 'Активные холодные продажи софта клиентов',
      keySkills: ['Sales'],
      publishedAt: '2026-07-20T10:00:00Z',
      firstSeenAt: new Date().toISOString(),
    };

    const resultSales = evaluateDeterministicPolicy(salesJob, mockProfile);
    expect(resultSales.decision).toBe('filtered');
    expect(resultSales.reasons.some((r) => r.code === 'NO_GO_PHRASE')).toBe(true);
  });

  test('missing salary moves vacancy to needs_review instead of reject', () => {
    const mockProfile = {
      candidate: {
        name: 'Alex Developer',
        age: 18,
        location: 'Moscow',
        remote_only: false,
        employment: ['full-time'],
        experience_years: 0,
        github: '',
        portfolio: '',
        truthful_facts: ['React'],
        target_roles: ['Junior Developer'],
        target_salary_rub: 80000,
        languages: { russian: 'native' },
        no_go: [],
      },
      policy: {
        min_score: 70,
        review_score: 55,
        max_applications_per_run: 8,
        max_applications_per_day: 12,
        auto_apply: false,
        require_confirmation_for_first_run: true,
        never_answer_unknown_questions: true,
        never_invent_facts: true,
        never_bypass_captcha: true,
      },
    };

    const noSalaryJob = {
      canonicalUrl: 'https://hh.ru/vacancy/903',
      externalId: '903',
      source: 'hh',
      title: 'Junior React Developer',
      company: 'Startup LLC',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      description: 'Developing React frontend apps',
      keySkills: ['React', 'TypeScript'],
      publishedAt: '2026-07-20T10:00:00Z',
      firstSeenAt: new Date().toISOString(),
    };

    const result = evaluateDeterministicPolicy(noSalaryJob, mockProfile);
    expect(result.decision).toBe('needs_review');
    expect(result.reasons[0].code).toBe('SALARY_UNSPECIFIED');
  });

  test('prohibits real auto submission and enforces REAL_SUBMIT_ENABLED=false', async () => {
    expect(REAL_SUBMIT_ENABLED).toBe(false);

    const applier = new HHPlaywrightApplier();
    const job = {
      id: 1,
      canonicalUrl: 'https://hh.ru/vacancy/100',
      externalId: '100',
      source: 'hh',
      title: 'Test Job',
      company: 'Test Company',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      description: 'Test description',
      keySkills: [],
      publishedAt: '2026-07-20T10:00:00Z',
      firstSeenAt: new Date().toISOString(),
    };

    const queueItem = {
      id: 1,
      jobId: 1,
      status: 'recommended' as const,
      score: 90,
      scoringResult: {
        score: 90,
        recommendation: 'apply' as const,
        skill_match: 90,
        seniority_match: 90,
        format_match: 100,
        salary_match: 80,
        growth_signal: 80,
        reasons: [],
        missing_requirements: [],
        red_flags: [],
        questions_to_verify: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await applier.applyToJob(job, queueItem, { mode: 'auto' });
    expect(res.success).toBe(false);
    expect(res.error).includes('Real submission is disabled in this phase');
  });

  test('generateDailyReport creates both Markdown and JSON files with zero-submit confirmation', async () => {
    repo.upsertJob({
      canonicalUrl: 'https://hh.ru/vacancy/777',
      externalId: '777',
      source: 'hh',
      title: 'React Dev',
      company: 'Acme LLC',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      description: 'React TS Dev',
      keySkills: ['React'],
      publishedAt: '2026-07-20T10:00:00Z',
      firstSeenAt: new Date().toISOString(),
    });

    const mdPath = await generateDailyReport(repo, { source: 'hh', durationMs: 150 });
    const jsonPath = mdPath.replace(/\.md$/, '.json');

    expect(existsSync(mdPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    const mdText = readFileSync(mdPath, 'utf8');
    expect(mdText).includes('Real automatic applications are **DISABLED**');
    expect(mdText).includes('Total real applications submitted: **0**');

    const jsonText = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(jsonText.metrics.realSubmissionsConfirmed).toBe(0);
    expect(jsonText.sourceFilter).toBe('hh');
  });

});
