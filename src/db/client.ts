import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = './data/jobs.db';

export function getDatabase(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Initialize table DDL idempotently
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      canonical_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      company_url TEXT,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      area_id INTEGER,
      remote INTEGER NOT NULL DEFAULT 0,
      salary_from INTEGER,
      salary_to INTEGER,
      currency TEXT,
      employment_type TEXT NOT NULL DEFAULT 'full-time',
      schedule TEXT,
      experience TEXT,
      key_skills TEXT NOT NULL DEFAULT '[]',
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      updated_at TEXT,
      alternate_url TEXT,
      raw_payload_hash TEXT NOT NULL,
      raw_payload_path TEXT,
      source_metadata TEXT,
      filter_reasons TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      UNIQUE(source, external_id)
    );

    CREATE TABLE IF NOT EXISTS vacancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_hash TEXT NOT NULL UNIQUE,
      canonical_url TEXT NOT NULL,
      external_id TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      company_url TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT,
      location TEXT NOT NULL,
      area_id INTEGER,
      is_remote INTEGER NOT NULL,
      employment_type TEXT NOT NULL,
      schedule TEXT,
      experience TEXT,
      description TEXT NOT NULL,
      key_skills TEXT NOT NULL,
      published_at TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      updated_at TEXT,
      alternate_url TEXT,
      raw_payload_path TEXT,
      source_metadata TEXT,
      filter_reasons TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      UNIQUE(source, external_id)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      score INTEGER NOT NULL,
      recommendation TEXT NOT NULL,
      scoring_result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      status TEXT NOT NULL,
      cover_letter_tone TEXT,
      cover_letter_text TEXT,
      screenshot_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES vacancies(id),
      status TEXT NOT NULL,
      score INTEGER NOT NULL,
      scoring_result TEXT NOT NULL,
      cover_letter_tone TEXT,
      cover_letter_text TEXT,
      screenshot_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      job_id INTEGER,
      job_url TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      job_id INTEGER,
      job_url TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Helper for idempotent column additions
  const safeAddColumn = (table: string, colDef: string) => {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
    } catch {
      // Column already exists
    }
  };

  const extraCols = [
    'company_url TEXT',
    'area_id INTEGER',
    'schedule TEXT',
    'experience TEXT',
    'alternate_url TEXT',
    'raw_payload_path TEXT',
    'source_metadata TEXT',
    'filter_reasons TEXT',
    'updated_at TEXT',
  ];

  for (const col of extraCols) {
    safeAddColumn('jobs', col);
    safeAddColumn('vacancies', col);
  }

  return { db: sqlite, sqlite };
}


