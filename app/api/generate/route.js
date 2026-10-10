import { addDaysLocal, getDb, todayLocal } from '@/lib/db.mjs';
import { newDraftDir } from '@/lib/drafts.mjs';
import { runningJob, spawnScript } from '@/lib/jobs.mjs';

// POST {}                         -> next missing day's draft from the rotation
// POST { topicId }                -> draft this topic right now
// POST { title, pillar, media }   -> add a custom topic and draft it right now
export async function POST(req) {
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  let topicId = body.topicId ? Number(body.topicId) : null;
  if (!topicId && body.title?.trim()) {
    db.prepare('INSERT OR IGNORE INTO topics(pillar, title, media_hint, priority) VALUES(?, ?, ?, 0)')
      .run(body.pillar || 'hld', body.title.trim(), body.media || 'any');
    topicId = db.prepare('SELECT id FROM topics WHERE title = ?').get(body.title.trim()).id;
  }

  if (topicId) {
    const t = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
    if (!t) return Response.json({ error: 'topic not found' }, { status: 404 });
    const info = db.prepare("INSERT INTO drafts(topic_id, for_date, dir, pillar, title, status) VALUES(?, ?, '', ?, ?, 'generating')")
      .run(t.id, todayLocal(), t.pillar, t.title);
    const id = Number(info.lastInsertRowid);
    db.prepare('UPDATE drafts SET dir = ? WHERE id = ?').run(newDraftDir(todayLocal(), id), id);
    spawnScript('generate.mjs', ['--draft', String(id), '--part', 'all']);
    return Response.json({ ok: true, draftId: id });
  }

  if (runningJob('generate')) return Response.json({ error: 'A generation is already running' }, { status: 409 });
  let date = todayLocal();
  for (let i = 0; i < 14; i++) {
    const d = addDaysLocal(`${todayLocal()} 12:00:00`, i).slice(0, 10);
    if (!db.prepare("SELECT 1 FROM drafts WHERE for_date=? AND status NOT IN ('rejected','failed')").get(d)) { date = d; break; }
  }
  spawnScript('generate.mjs', ['--date', date]);
  return Response.json({ ok: true, date });
}
