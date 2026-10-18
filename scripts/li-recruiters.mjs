// Find recruiters on LinkedIn (via web search) and draft a connection note, DM and two follow-ups for each.
// Nothing is sent: the user sends every invite and message by hand from the Outreach > LinkedIn tab.
// Usage: node scripts/li-recruiters.mjs [--n 15] [--mode remote|onsite]
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ROOT, config } from '../lib/config.mjs';
import { runClaude } from '../lib/claude.mjs';
import { getDb, nowLocal, todayLocal } from '../lib/db.mjs';
import { cleanEmail } from '../lib/human.mjs';
import { finishJob, jobLog, startJob } from '../lib/jobs.mjs';
import { macNotify } from '../lib/notify.mjs';
import { normaliseProfileUrl, yearsOfExperience } from '../lib/outreach.mjs';

const argv = process.argv.slice(2);
const n = Math.min(Number(argv[argv.indexOf('--n') + 1]) || 15, 25);
const mode = argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : '';
const db = getDb();
const today = todayLocal();

// Your own list (config/li-targets.json, not in git) wins over the shipped example.
const targetsFile = () => ['li-targets.json', 'li-targets.example.json'].map((f) => path.join(ROOT, 'config', f)).find((f) => fs.existsSync(f));

const job = startJob('li-recruiters', `find ${n}${mode ? ` ${mode}` : ''} recruiters`);
try {
  const dir = path.join(DATA_DIR, 'li-batches');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = `${today}-${Date.now()}`;
  const skip = path.join(dir, `${stamp}-skip.json`);
  const output = path.join(dir, `${stamp}-out.json`);
  fs.writeFileSync(skip, JSON.stringify(db.prepare('SELECT profile_url FROM li_contacts').all().map((r) => r.profile_url)));

  const prompt = fs.readFileSync(path.join(ROOT, 'prompts', 'li-recruiters.md'), 'utf8')
    .replaceAll('{{NAME}}', config.fromName || 'the sender').replaceAll('{{ROLES}}', config.targetRoles).replaceAll('{{YEARS}}', yearsOfExperience())
    .replaceAll('{{TARGETS}}', targetsFile())
    .replaceAll('{{SKIP}}', skip).replaceAll('{{OUTPUT}}', output).replaceAll('{{N}}', String(n))
    .replaceAll('{{MODE_FILTER}}', mode ? ` (this run: ONLY "${mode}" companies)` : '');
  jobLog(job, 'searching for recruiters and drafting messages…');
  await runClaude(prompt, { addDirs: [dir, path.join(ROOT, 'config')] });

  const found = JSON.parse(fs.readFileSync(output, 'utf8'));
  const ins = db.prepare(`INSERT OR IGNORE INTO li_contacts(profile_url, name, title, company, mode, tier, evidence, note, dm, followup1, followup2)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let added = 0;
  db.transaction(() => {
    for (const r of found) {
      const url = normaliseProfileUrl(r.profile_url);
      if (!url || !r.name || !r.note) { jobLog(job, `dropped (no valid profile URL): ${r.name || '?'}`); continue; }
      const m = ['remote', 'hybrid', 'onsite'].includes(r.mode) ? r.mode : 'onsite';
      const res = ins.run(url, r.name, r.title || '', r.company || '', m, r.tier === 'A' ? 'A' : 'B', r.evidence || '',
        cleanEmail(r.note), cleanEmail(r.dm || ''), cleanEmail(r.followup1 || ''), cleanEmail(r.followup2 || ''));
      added += res.changes;
    }
  })();
  const long = db.prepare("SELECT COUNT(*) n FROM li_contacts WHERE status='drafted' AND length(note) > 200").get().n;
  finishJob(job, true, `${added} recruiters added${long ? ` · ${long} notes over 200 chars, trim before sending` : ''}`);
  macNotify('LinkedIn recruiters ready', `${added} recruiters with drafted notes. Updated ${nowLocal().slice(11, 16)}.`);
  console.log(`${added} added`);
  process.exit(0);
} catch (e) {
  jobLog(job, e.stack);
  finishJob(job, false, e.message.slice(0, 300));
  console.error(e.message);
  process.exit(1);
}
