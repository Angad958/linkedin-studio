// Prepare today's outreach batch (drafts only; nothing is sent until approved in the UI).
// Usage: node scripts/outreach.mjs [--n 20] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../lib/config.mjs';
import { runClaude } from '../lib/claude.mjs';
import { getDb, nowLocal, todayLocal } from '../lib/db.mjs';
import { cleanEmail } from '../lib/human.mjs';
import { finishJob, jobLog, startJob } from '../lib/jobs.mjs';
import { macNotify } from '../lib/notify.mjs';
import { pickContacts } from '../lib/outreach.mjs';
import { ROOT } from '../lib/config.mjs';

const argv = process.argv.slice(2);
const n = Number(argv[argv.indexOf('--n') + 1]) || config.newPerDay;
const force = argv.includes('--force');
const db = getDb();
const today = todayLocal();

const job = startJob('outreach', `batch ${today}`);
try {
  const pending = db.prepare("SELECT COUNT(DISTINCT contact_id) c FROM messages WHERE status = 'draft'").get().c;
  if (pending && !force) {
    finishJob(job, true, `${pending} drafts still awaiting approval; not creating a new batch`);
    console.log('pending batch exists');
    process.exit(0);
  }
  const { contacts, tiers, rate } = pickContacts(n);
  jobLog(job, `picked ${contacts.length} contacts from tiers ${tiers.join('+')} (bounce rate ${(rate * 100).toFixed(1)}%)`);
  if (!contacts.length) { finishJob(job, true, 'no contacts left to email'); process.exit(0); }

  const dir = path.join(DATA_DIR, 'batches');
  fs.mkdirSync(dir, { recursive: true });
  const input = path.join(dir, `${today}-in.json`);
  const output = path.join(dir, `${today}-out.json`);
  fs.rmSync(output, { force: true });
  fs.writeFileSync(input, JSON.stringify(contacts.map((c) => ({ id: c.id, name: c.name || '', company: c.company || '', kind: c.kind })), null, 1));
  const latest = db.prepare("SELECT posted_url, title FROM drafts WHERE status='posted' AND posted_url IS NOT NULL ORDER BY posted_at DESC LIMIT 1").get();
  const prompt = fs.readFileSync(path.join(ROOT, 'prompts', 'outreach-batch.md'), 'utf8')
    .replaceAll('{{ROLES}}', config.targetRoles).replaceAll('{{INPUT}}', input).replaceAll('{{OUTPUT}}', output)
    .replaceAll('{{LATEST_POST}}', latest ? `a pointer to his recent LinkedIn post "${latest.title}" (${latest.posted_url})` : 'a different proof point');
  jobLog(job, 'running claude to write emails…');
  await runClaude(prompt, { addDirs: [dir] });
  const emails = JSON.parse(fs.readFileSync(output, 'utf8'));
  const byId = new Map(emails.map((e) => [Number(e.id), e]));

  const ins = db.prepare(`INSERT INTO messages(contact_id, batch_date, step, subject, body, status) VALUES(?, ?, ?, ?, ?, 'draft')
    ON CONFLICT(contact_id, step) DO UPDATE SET subject=excluded.subject, body=excluded.body, batch_date=excluded.batch_date, status='draft', scheduled_at=NULL, error=NULL`);
  let made = 0;
  db.transaction(() => {
    for (const c of contacts) {
      const e = byId.get(c.id);
      if (!e?.body) continue;
      const subj = cleanEmail(e.subject).trim();
      ins.run(c.id, today, 0, subj, cleanEmail(e.body).trim());
      ins.run(c.id, today, 1, `Re: ${subj}`, cleanEmail(e.followup1 || '').trim());
      ins.run(c.id, today, 2, `Re: ${subj}`, cleanEmail(e.followup2 || '').trim());
      db.prepare("UPDATE contacts SET status='queued', updated_at=? WHERE id=?").run(nowLocal(), c.id);
      made++;
    }
  })();
  finishJob(job, true, `${made} emails drafted for approval`);
  macNotify('Recruiter batch ready', `${made} emails waiting for your approval.`);
  console.log(`${made} drafted`);
  process.exit(0);
} catch (e) {
  jobLog(job, e.stack);
  finishJob(job, false, e.message.slice(0, 300));
  console.error(e.message);
  process.exit(1);
}
