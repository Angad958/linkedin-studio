import { getDb } from '@/lib/db.mjs';

export async function POST(req) {
  const { pillar, title, media_hint, priority } = await req.json();
  if (!title?.trim()) return Response.json({ error: 'title required' }, { status: 400 });
  getDb().prepare('INSERT OR IGNORE INTO topics(pillar, title, media_hint, priority) VALUES(?, ?, ?, ?)')
    .run(pillar || 'hld', title.trim(), media_hint || 'any', Number(priority) || 0);
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const { id, priority, reset } = await req.json();
  if (reset) getDb().prepare('UPDATE topics SET used_at = NULL WHERE id = ?').run(id);
  if (priority !== undefined) getDb().prepare('UPDATE topics SET priority = ? WHERE id = ?').run(Number(priority), id);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { id } = await req.json();
  getDb().prepare('DELETE FROM topics WHERE id = ? AND id NOT IN (SELECT topic_id FROM drafts WHERE topic_id IS NOT NULL)').run(id);
  return Response.json({ ok: true });
}
