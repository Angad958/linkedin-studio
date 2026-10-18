// Runs daily at 12:00 (launchd). Posts ONE approved-but-unposted draft to LinkedIn, in the order they were approved.
// Skips if something was already posted today, if LinkedIn isn't connected, or (after sleep) if it's past AUTO_POST_UNTIL.
// Drafts already live on LinkedIn (li_post_urn set, only the first comment failed) are never posted again.
// Usage: node scripts/auto-post.mjs [--force]   (--force ignores the time window and the one-per-day rule)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, config } from '../lib/config.mjs';
import { getDb, nowLocal, todayLocal } from '../lib/db.mjs';
import { finishJob, startJob } from '../lib/jobs.mjs';
import { getAuth } from '../lib/linkedin.mjs';
import { macNotify } from '../lib/notify.mjs';
import { activePublishJob } from '../lib/publish-state.mjs';

const force = process.argv.includes('--force');
const db = getDb();
const today = todayLocal();
const hour = new Date().getHours();

if (!config.autoPost && !force) process.exit(0);
if (!force && (hour < 12 || hour >= config.autoPostUntil)) {
  console.log(`outside the auto-post window (12:00-${config.autoPostUntil}:00); nothing posted`);
  process.exit(0);
}
if (!force && db.prepare("SELECT 1 FROM drafts WHERE status='posted' AND substr(posted_at,1,10)=?").get(today)) {
  console.log('already posted today');
  process.exit(0);
}
const d = db.prepare(`SELECT * FROM drafts WHERE status='approved' AND li_post_urn IS NULL
  ORDER BY approved_at IS NULL, approved_at, id LIMIT 1`).get();
if (!d) { console.log('no approved drafts waiting'); process.exit(0); }
if (activePublishJob(d.id)) { console.log(`draft ${d.id} is already being posted`); process.exit(0); }
if (!getAuth()) {
  macNotify('LinkedIn Studio', `Auto-post skipped: LinkedIn isn't connected. Reconnect in Settings to post "${d.title}".`);
  console.log('LinkedIn not connected');
  process.exit(0);
}

// Same steps as the "Post to LinkedIn" button: mark publishing, register the job, run publish.mjs.
db.prepare("UPDATE drafts SET status='publishing', error=NULL, updated_at=? WHERE id=?").run(nowLocal(), d.id);
const jobId = startJob('publish', `draft ${d.id}: publish (auto 12:00)`);
console.log(`auto-posting draft ${d.id}: ${d.title}`);
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'publish.mjs'), '--draft', String(d.id), '--job', String(jobId)], { stdio: 'inherit', cwd: ROOT });
if (r.status !== 0 && r.status !== null) finishJob(jobId, false);
process.exit(r.status ?? 1);
