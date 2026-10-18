// Daily post generation. Usage:
//   node scripts/generate.mjs                 -> today's draft (skips if one exists)
//   node scripts/generate.mjs --date 2026-10-12
//   node scripts/generate.mjs --draft 5 --feedback "make it shorter" [--part media|all]
//   node scripts/generate.mjs --ahead 3       -> make sure the next 3 days have drafts
import fs from 'node:fs';
import { ROOT, config } from '../lib/config.mjs';
import { runClaude } from '../lib/claude.mjs';
import { addDaysLocal, getDb, nowLocal, todayLocal } from '../lib/db.mjs';
import { TARGET_SCORE, buildPrompt, coach, firstPersonLines, ingestDraft, newDraftDir, pickTopic, refreshText, setMediaWarnings } from '../lib/drafts.mjs';
import { finishJob, jobLog, startJob } from '../lib/jobs.mjs';
import { sendToSelf } from '../lib/mailer.mjs';
import { macNotify } from '../lib/notify.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const db = getDb();

async function generateOne({ date, draftId, feedback, part = 'all' }) {
  let d;
  let topic;
  if (draftId) {
    d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId);
    topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(d.topic_id) || { title: d.title, pillar: d.pillar };
    db.prepare("UPDATE drafts SET status='generating', feedback=?, error=NULL, updated_at=? WHERE id=?").run(feedback || null, nowLocal(), d.id);
  } else {
    if (db.prepare("SELECT 1 FROM drafts WHERE for_date = ? AND status != 'rejected' AND status != 'failed'").get(date)) {
      console.log(`draft for ${date} already exists`);
      return null;
    }
    topic = pickTopic(date);
    if (!topic) throw new Error('Topic backlog is empty. Add topics on the Topics page.');
    const info = db.prepare("INSERT INTO drafts(topic_id, for_date, dir, pillar, title) VALUES(?, ?, '', ?, ?)").run(topic.id, date, topic.pillar, topic.title);
    const id = Number(info.lastInsertRowid);
    db.prepare('UPDATE drafts SET dir = ? WHERE id = ?').run(newDraftDir(date, id), id);
    d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  }

  const job = startJob('generate', `draft ${d.id}: ${topic.title}`);
  jobLog(job, `topic: ${topic.title} (${topic.pillar}), part=${part}`);
  try {
    if (part === 'all') {
      for (const f of ['post.txt', 'draft.txt', 'meta.json', 'carousel.json', 'animation.json', 'diagram.json']) fs.rmSync(`${d.dir}/${f}`, { force: true });
    }
    jobLog(job, 'running claude (li-post → media spec → li-human)…');
    const res = await runClaude(buildPrompt({ topic, dir: d.dir, feedback, part }), { onLine: (l) => l && jobLog(job, l) });
    jobLog(job, `claude: ${String(res.result).trim().slice(0, 200)}`);
    let out;
    try {
      out = await ingestDraft(d.id, { log: (l) => jobLog(job, l) });
    } catch (e) {
      // One automatic repair pass when the media spec fails to render (e.g. invalid Mermaid).
      jobLog(job, `render failed: ${e.message}. asking claude to fix the media spec`);
      await runClaude(buildPrompt({ topic, dir: d.dir, part: 'media', feedback: `The media spec failed to render with: ${e.message}. Fix it.` }));
      out = await ingestDraft(d.id, { log: (l) => jobLog(job, l) });
    }
    // 1. Score loop: rewrite until the coach says DONE (85+, no first person, 900-1300 chars). Keep the best version.
    if (part !== 'media') {
      let c = coach(d.dir);
      let best = { score: c.ok ? 999 : c.score, text: fs.readFileSync(`${d.dir}/post.txt`, 'utf8'), meta: fs.readFileSync(`${d.dir}/meta.json`, 'utf8') };
      for (let round = 1; !c.ok && round <= 4; round++) {
        jobLog(job, `score ${c.score} < ${TARGET_SCORE} (or rules failed), rewrite round ${round}`);
        await runClaude(`Improve ${d.dir}/post.txt so it passes the coach. Coach output:\n\n${c.report}\n\n` +
          (['hld', 'lld'].includes(topic.pillar)
            ? `Rules: this is a ${topic.pillar.toUpperCase()} explainer, no case study or company story. Keep the facts, meaning and structure (hook line, "The design:"/"The classes:" → steps, trade-off, "Takeaway:" line, closing question). `
            : `Rules: keep the case study, facts, meaning and structure (hook line, → steps, analogy, fix, "Takeaway:" line, closing question). `) +
          `No first person (I/me/my/we/our/us). 900-1300 chars. Study ${ROOT}/content/reference/*.txt for rhythm. ` +
          `Edit post.txt directly, then run: python3 ${ROOT}/scripts/coach.py ${d.dir}/post.txt --target ${TARGET_SCORE} and keep iterating up to 4 times until it prints DONE. ` +
          `If you change the first line, update hooks[chosen].line in ${d.dir}/meta.json to match exactly. Reply DONE <score>.`, { onLine: (l) => l && jobLog(job, l) });
        c = coach(d.dir);
        if (c.ok || c.score > best.score) best = { score: c.ok ? 999 : c.score, text: fs.readFileSync(`${d.dir}/post.txt`, 'utf8'), meta: fs.readFileSync(`${d.dir}/meta.json`, 'utf8') };
      }
      if (!c.ok) { // restore the best attempt
        fs.writeFileSync(`${d.dir}/post.txt`, best.text);
        fs.writeFileSync(`${d.dir}/meta.json`, best.meta);
      }
      out = { ...out, ...refreshText(d.id) };
      const left = firstPersonLines(out.text);
      if (left.length || !coach(d.dir).ok) {
        const flags = JSON.parse(db.prepare('SELECT flags_json FROM drafts WHERE id=?').get(d.id).flags_json || '[]');
        if (left.length) flags.push(`First person still in: ${left.join(' | ')}`);
        if (out.human.score < TARGET_SCORE) flags.push(`Human score ${out.human.score} is below the ${TARGET_SCORE} target after 4 rewrites.`);
        db.prepare('UPDATE drafts SET flags_json = ? WHERE id = ?').run(JSON.stringify(flags), d.id);
      }
      jobLog(job, `final human score ${out.human.score}`);
    }

    // 2. Media review: Claude looks at the rendered images and fixes the spec. Up to 2 rounds.
    for (let round = 1; round <= 2; round++) {
      const imgs = (out.qa || []).map((f) => `${d.dir}/${f}`);
      if (!imgs.length) break;
      jobLog(job, `media review round ${round} (${imgs.length} images, ${out.warnings.length} warnings)`);
      const res = await runClaude(fs.readFileSync(`${ROOT}/prompts/media-review.md`, 'utf8')
        .replaceAll('{{IMAGES}}', imgs.map((i) => `- ${i}`).join('\n'))
        .replaceAll('{{WARNINGS}}', out.warnings.length ? out.warnings.map((w) => `- ${w}`).join('\n') : '- none')
        .replaceAll('{{SPEC}}', `${d.dir}/${out.meta.media_type}.json`)
        .replaceAll('{{POST}}', `${d.dir}/post.txt`), { onLine: (l) => l && jobLog(job, l) });
      const verdict = String(res.result).trim();
      jobLog(job, `review: ${verdict.slice(0, 160)}`);
      if (!/^FIXED/i.test(verdict)) break;
      out = { ...out, ...(await ingestDraft(d.id, { log: (l) => jobLog(job, l) })) };
    }
    setMediaWarnings(d.id, out.warnings || []);
    db.prepare("UPDATE drafts SET status='pending', updated_at=? WHERE id=?").run(nowLocal(), d.id); // only now ready for review

    db.prepare("UPDATE topics SET used_at = ? WHERE id = ? AND used_at IS NULL").run(nowLocal(), topic.id);
    finishJob(job, true, `draft ${d.id} ready · ${out.meta.media_type} · human ${out.human.score} ${out.human.verdict}`);
    macNotify('LinkedIn draft ready', `${topic.title} (${out.meta.media_type}). Open the Studio to approve.`);
    await sendToSelf(`[LinkedIn Studio] Draft ready: ${topic.title}`,
      `Today's draft is waiting for approval:\n${config.baseUrl}/draft/${d.id}\n\n${fs.readFileSync(`${d.dir}/post.txt`, 'utf8')}`).catch(() => {});
    return d.id;
  } catch (e) {
    db.prepare("UPDATE drafts SET status='failed', error=?, updated_at=? WHERE id=?").run(String(e.message).slice(0, 2000), nowLocal(), d.id);
    finishJob(job, false, e.message.slice(0, 300));
    macNotify('LinkedIn draft failed', e.message.slice(0, 120));
    throw e;
  }
}

try {
  if (args.draft) {
    await generateOne({ draftId: Number(args.draft), feedback: args.feedback === true ? '' : args.feedback, part: args.part || 'all' });
  } else {
    const ahead = Number(args.ahead || 1);
    const start = typeof args.date === 'string' ? args.date : todayLocal();
    for (let i = 0; i < ahead; i++) await generateOne({ date: addDaysLocal(`${start} 12:00:00`, i).slice(0, 10) });
  }
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
