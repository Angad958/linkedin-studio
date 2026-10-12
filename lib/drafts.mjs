import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DRAFTS_DIR, LI_DIR, ROOT, config } from './config.mjs';
import { getDb, nowLocal } from './db.mjs';
import { scoreText } from './human.mjs';
import { renderMedia } from './render.mjs';

export const PILLARS = {
  distributed: 'Distributed systems fundamentals',
  hld: 'High-level design / system design case study',
  lld: 'Low-level design, OOP and design patterns',
  incident: 'Production incident / postmortem lessons',
  ai: 'AI engineering: RAG, LLM serving, evals, agents, MCP',
  howitworks: 'How a famous product feature works under the hood',
  casestudy: 'A famous real-world engineering case study or outage postmortem, explained simply',
};
// Sunday..Saturday
const WEEKDAY_PILLAR = ['casestudy', 'distributed', 'hld', 'lld', 'incident', 'ai', 'howitworks'];

export function pickTopic(date) {
  const db = getDb();
  const pillar = WEEKDAY_PILLAR[new Date(`${date}T12:00:00`).getDay()];
  const q = `SELECT * FROM topics WHERE used_at IS NULL AND id NOT IN (SELECT topic_id FROM drafts WHERE topic_id IS NOT NULL AND status != 'rejected')`;
  return db.prepare(`${q} AND pillar = ? ORDER BY priority DESC, id LIMIT 1`).get(pillar)
    || db.prepare(`${q} ORDER BY priority DESC, id LIMIT 1`).get();
}

export function recentFirstLines(limit = 12) {
  return getDb().prepare("SELECT text FROM drafts WHERE status IN ('posted','approved','pending') AND text IS NOT NULL ORDER BY id DESC LIMIT ?")
    .all(limit).map((r) => `  - ${r.text.split('\n')[0].slice(0, 140)}`).join('\n') || '  (none yet)';
}

export function buildPrompt({ topic, dir, feedback, part }) {
  const tpl = fs.readFileSync(path.join(ROOT, 'prompts', 'daily-post.md'), 'utf8');
  const openToWork = process.env.OPEN_TO_WORK_TAG !== 'false';
  let fb = '';
  if (feedback) fb += `\n## Manav's feedback on the previous version (apply it)\n${feedback}\n`;
  if (part === 'media') {
    fb += `\n## Scope: MEDIA ONLY\npost.txt and meta.json already exist in the output directory. Keep post.txt unchanged.` +
      ` Rewrite only the media spec file (and media_type in meta.json if the feedback asks for a different format). Skip steps 2, 3, 5.\n`;
  }
  const vars = {
    TOPIC: topic.title, PILLAR: topic.pillar, PILLAR_DESC: PILLARS[topic.pillar] || '',
    MEDIA_HINT: topic.media_hint || 'any', DIR: dir, ROOT, RECENT: recentFirstLines(), FEEDBACK: fb,
    HASHTAG_RULE: process.env.POST_HASHTAGS
      ? `end with ONE line of exactly 2 topical hashtags (e.g. #HowItWorks #GoogleMaps: the content type plus the product/concept). They are merged with the fixed footer (${process.env.POST_HASHTAGS}) when posting, so never repeat those`
      : openToWork
      ? 'max 3 hashtags at the very end: #SystemDesign (or the closest real category), one topical tag, and #OpenToWork'
      : 'max 3 real hashtags at the very end, e.g. #SystemDesign',
  };
  return tpl.replace(/\{\{(TOPIC|PILLAR_DESC|PILLAR|MEDIA_HINT|DIR|ROOT|RECENT|FEEDBACK|HASHTAG_RULE)\}\}/g, (_, k) => vars[k]);
}

export const TARGET_SCORE = Number(process.env.TARGET_HUMAN_SCORE || 85);

// Run scripts/coach.py: the detector score plus concrete fixes. ok = target met + rules pass.
export function coach(dir) {
  try {
    const out = execFileSync('python3', [path.join(ROOT, 'scripts', 'coach.py'), path.join(dir, 'post.txt'), '--target', String(TARGET_SCORE)], { encoding: 'utf8' });
    return { ok: true, report: out, score: Number(out.match(/HUMAN SCORE ([\d.]+)/)?.[1]) };
  } catch (e) {
    const out = String(e.stdout || e.message);
    return { ok: false, report: out, score: Number(out.match(/HUMAN SCORE ([\d.]+)/)?.[1]) || 0 };
  }
}

function readOutputs(dir) {
  const metaPath = path.join(dir, 'meta.json');
  const postPath = path.join(dir, 'post.txt');
  if (!fs.existsSync(metaPath) || !fs.existsSync(postPath)) throw new Error('Claude did not write post.txt/meta.json');
  return { meta: JSON.parse(fs.readFileSync(metaPath, 'utf8')), text: fs.readFileSync(postPath, 'utf8').trim() };
}

function caseFlag(meta) {
  if (!meta.case_study?.name) return [];
  const c = meta.case_study;
  return [`Case study: ${c.name}${c.real ? ` (real${c.source ? ', source in first comment' : ', no source given, so verify it'})` : ' (illustrative scenario)'}`];
}

// Text-only refresh (after a rewrite): re-read post + meta and re-score, no re-render.
export function refreshText(id) {
  const db = getDb();
  const d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  const { meta, text } = readOutputs(d.dir);
  const human = scoreText(text);
  const extra = JSON.parse(d.flags_json || '[]').filter((f) => f.startsWith('Media:'));
  db.prepare(`UPDATE drafts SET title=?, text=?, hooks_json=?, chosen_hook=?, first_comment=?, flags_json=?, human_score=?, human_verdict=?, human_report=?, updated_at=? WHERE id=?`)
    .run(meta.title || d.title, text, JSON.stringify(meta.hooks || []), meta.chosen ?? 0, meta.first_comment || '',
      JSON.stringify([...caseFlag(meta), ...(meta.flags || []), ...extra]), human.score, human.verdict, human.report, nowLocal(), id);
  return { meta, text, human };
}

// Render media from the spec and store everything on the draft row.
export async function ingestDraft(id, { log = () => {} } = {}) {
  const db = getDb();
  const d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  const { meta } = readOutputs(d.dir);
  log(`rendering ${meta.media_type}`);
  const r = await renderMedia(meta.media_type, d.dir);
  db.prepare("UPDATE drafts SET media_type=?, media_json=?, error=NULL, updated_at=? WHERE id=?")
    .run(meta.media_type, JSON.stringify(r.media), nowLocal(), id);
  const t = refreshText(id);
  return { ...t, media: r.media, warnings: r.warnings, qa: r.qa };
}

export function setMediaWarnings(id, warnings) {
  const db = getDb();
  const d = db.prepare('SELECT flags_json FROM drafts WHERE id = ?').get(id);
  const flags = JSON.parse(d.flags_json || '[]').filter((f) => !f.startsWith('Media:'));
  db.prepare('UPDATE drafts SET flags_json = ? WHERE id = ?').run(JSON.stringify([...flags, ...warnings.map((w) => `Media: ${w}`)]), id);
}

export function newDraftDir(date, id) {
  const dir = path.join(DRAFTS_DIR, `${date}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Append to the li-pack log so /li-audit and /li-plan can learn from history.
export function appendPostLog(d) {
  fs.mkdirSync(LI_DIR, { recursive: true });
  const hooks = JSON.parse(d.hooks_json || '[]');
  const h = hooks[d.chosen_hook ?? 0];
  const entry = [
    `\n## ${d.posted_at?.slice(0, 10) || nowLocal().slice(0, 10)} · ${d.title || ''}`,
    `- hook: ${h ? `#${h.n} ${h.formula}` : 'n/a'}`,
    `- format: ${d.media_type || 'text'} · pillar: ${d.pillar}`,
    `- first line: ${(d.text || '').split('\n')[0]}`,
    `- length: ${(d.text || '').length} chars · human score: ${d.human_score ?? 'n/a'}`,
    d.posted_url ? `- url: ${d.posted_url}` : null,
  ].filter(Boolean).join('\n');
  fs.appendFileSync(path.join(LI_DIR, 'log.md'), `${entry}\n`);
}

// Posts must not use first person. Returns the offending lines (empty array = clean).
const FIRST_PERSON = /\b(I|I'm|I've|I'd|I'll)\b|\b(me|my|mine|myself|we|we're|we've|we'd|we'll|our|ours|ourselves|us)\b/i;
export function firstPersonLines(text = '') {
  return text.split('\n').filter((l) => FIRST_PERSON.test(l.replace(/\bus-[a-z]|\bI\/O\b|\bU\.?S\.?\b/g, '')));
}

export const mediaUrl = (draftId, file) => `/api/media/${draftId}/${encodeURIComponent(file)}`;
export { config };
