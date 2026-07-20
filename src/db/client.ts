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

  // Initialize table DDL
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS vacancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_hash TEXT NOT NULL UNIQUE,
      canonical_url TEXT NOT NULL,
      external_id TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT,
      location TEXT NOT NULL,
      is_remote INTEGER NOT NULL,
      employment_type TEXT NOT NULL,
      description TEXT NOT NULL,
      key_skills TEXT NOT NULL,
      published_at TEXT NOT NULL,
      first_seen_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      job_id INTEGER,
      job_url TEXT,
      details TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  return { db: sqlite, sqlite };
}
