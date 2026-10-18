import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.mjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY,
  pillar TEXT NOT NULL,
  title TEXT NOT NULL UNIQUE,
  angle TEXT,
  media_hint TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER REFERENCES topics(id),
  for_date TEXT NOT NULL,
  dir TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating', -- generating|pending|approved|publishing|posted|rejected|failed
  pillar TEXT,
  title TEXT,
  text TEXT,
  hooks_json TEXT,
  chosen_hook INTEGER,
  first_comment TEXT,
  media_type TEXT,
  media_json TEXT,
  flags_json TEXT,
  human_score REAL,
  human_verdict TEXT,
  human_report TEXT,
  feedback TEXT,
  error TEXT,
  posted_url TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS domains (
  domain TEXT PRIMARY KEY,
  has_mx INTEGER,
  checked_at TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  domain TEXT,
  source TEXT,
  kind TEXT,            -- named|generic|personal|agency
  score INTEGER,
  tier TEXT,            -- A|B|C|X (excluded)
  excluded_reason TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new|queued|contacted|replied|interview|closed|opted_out|bounced
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS contacts_tier ON contacts(tier, status, score);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  batch_date TEXT NOT NULL,
  step INTEGER NOT NULL,          -- 0 first email, 1 follow-up +4d, 2 follow-up +10d
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|approved|scheduled|sent|cancelled|failed
  scheduled_at TEXT,
  sent_at TEXT,
  message_id TEXT,
  error TEXT,
  UNIQUE(contact_id, step)
);
CREATE INDEX IF NOT EXISTS messages_due ON messages(status, scheduled_at);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running|done|failed
  detail TEXT,
  log TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
-- LinkedIn recruiter outreach. The Studio finds and drafts; the user sends every invite and DM by hand.
CREATE TABLE IF NOT EXISTS li_contacts (
  id INTEGER PRIMARY KEY,
  profile_url TEXT NOT NULL UNIQUE,
  name TEXT,
  title TEXT,
  company TEXT,
  mode TEXT,            -- remote|hybrid|onsite (the company's SDE work model)
  tier TEXT,            -- A|B
  evidence TEXT,        -- where the profile / work model came from
  note TEXT,            -- connection note, <= 200 chars
  dm TEXT,              -- first message after they accept
  followup1 TEXT,       -- +4 days after the DM
  followup2 TEXT,       -- +10 days after the DM
  status TEXT NOT NULL DEFAULT 'drafted', -- drafted|invited|connected|messaged|followed1|followed2|replied|closed|skipped
  invited_at TEXT,
  connected_at TEXT,
  dm_sent_at TEXT,
  followup1_sent_at TEXT,
  followup2_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`;

let db;
export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, 'studio.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  const cols = db.prepare('PRAGMA table_info(drafts)').all().map((c) => c.name);
  if (!cols.includes('li_post_urn')) db.exec('ALTER TABLE drafts ADD COLUMN li_post_urn TEXT');
  if (!cols.includes('approved_at')) {
    // Auto-post goes in approval order. Drafts approved before this column existed use their last update time.
    db.exec('ALTER TABLE drafts ADD COLUMN approved_at TEXT');
    db.exec("UPDATE drafts SET approved_at = updated_at WHERE status IN ('approved','publishing')");
  }
  if (!cols.includes('li_comment_done')) db.exec('ALTER TABLE drafts ADD COLUMN li_comment_done INTEGER NOT NULL DEFAULT 0');
  return db;
}

export function kvGet(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}
export function kvSet(key, value) {
  getDb().prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export const nowLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
export const todayLocal = () => nowLocal().slice(0, 10);
export const addDaysLocal = (base, days) => {
  const d = new Date(base.replace(' ', 'T'));
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
