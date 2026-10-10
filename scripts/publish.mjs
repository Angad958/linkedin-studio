// Publish an approved draft to LinkedIn via the official API. Usage: node scripts/publish.mjs --draft 5 [--job <id>]
import path from 'node:path';
import { getDb, nowLocal } from '../lib/db.mjs';
import { appendPostLog } from '../lib/drafts.mjs';
import { finishJob, jobLog, startJob } from '../lib/jobs.mjs';
import { createClient, getAuth } from '../lib/linkedin.mjs';
import { macNotify } from '../lib/notify.mjs';
import { publishDraft } from '../lib/publish.mjs';

const i = process.argv.indexOf('--draft');
const id = Number(process.argv[i + 1]);
const db = getDb();
const get = () => db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
const j = process.argv.indexOf('--job');
const jobId = j > 0 ? Number(process.argv[j + 1]) : startJob('publish', `draft ${id}: publish`);
const log = (s) => { console.log(s); jobLog(jobId, s); };

const d = get();
try {
  if (!d) throw new Error(`draft ${id} not found`);
  const auth = getAuth();
  if (!auth) throw new Error('LinkedIn is not connected (or the token expired). Connect it in Settings.');
  const save = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE drafts SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => fields[k]), nowLocal(), id);
  };
  const { url } = await publishDraft(d, { client: createClient(auth), save, log, filePath: (f) => path.join(d.dir, f) });
  db.prepare("UPDATE drafts SET status='posted', posted_url=?, posted_at=?, error=NULL, updated_at=? WHERE id=?").run(url, nowLocal(), nowLocal(), id);
  appendPostLog(get());
  log(`done: ${url}`);
  finishJob(jobId, true);
  macNotify('LinkedIn Studio', `Posted: ${d.title}`);
} catch (e) {
  const posted = get()?.li_post_urn;
  const msg = posted ? `Posted, but the first comment failed: ${e.message}. Retry posts only the comment.` : e.message;
  db.prepare("UPDATE drafts SET status='approved', error=?, updated_at=? WHERE id=?").run(msg, nowLocal(), id);
  log(`failed: ${msg}`);
  finishJob(jobId, false);
  macNotify('LinkedIn Studio', `Publish failed: ${msg.slice(0, 120)}`);
  process.exitCode = 1;
}
