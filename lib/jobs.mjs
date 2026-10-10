import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { getDb, nowLocal } from './db.mjs';

// Records a job row so the UI can show progress of long-running scripts.
export function startJob(type, detail = '') {
  const info = getDb().prepare('INSERT INTO jobs(type, detail) VALUES(?, ?)').run(type, detail);
  return Number(info.lastInsertRowid);
}
export function jobLog(id, line) {
  if (!id) return;
  getDb().prepare("UPDATE jobs SET log = log || ? WHERE id = ?").run(`[${nowLocal().slice(11)}] ${line}\n`, id);
}
export function finishJob(id, ok, detail) {
  if (!id) return;
  getDb().prepare('UPDATE jobs SET status = ?, finished_at = ?, detail = COALESCE(?, detail) WHERE id = ?')
    .run(ok ? 'done' : 'failed', nowLocal(), detail ?? null, id);
}
export function runningJob(type) {
  return getDb().prepare("SELECT * FROM jobs WHERE type = ? AND status = 'running' AND started_at > datetime('now','localtime','-45 minutes') ORDER BY id DESC LIMIT 1").get(type);
}

// Launch a script detached from the web server so it survives request lifecycles.
export function spawnScript(script, args = []) {
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT, detached: true, stdio: 'ignore', env: process.env,
  });
  child.unref();
}
