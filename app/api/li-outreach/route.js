import { getDb, nowLocal } from '@/lib/db.mjs';
import { runningJob, spawnScript } from '@/lib/jobs.mjs';

// Each manual step the user marks on LinkedIn, and the timestamp column it records.
const STEPS = {
  invited: 'invited_at', connected: 'connected_at', messaged: 'dm_sent_at',
  followed1: 'followup1_sent_at', followed2: 'followup2_sent_at', replied: null, closed: null, skipped: null,
};
const EDITABLE = ['note', 'dm', 'followup1', 'followup2'];

export async function POST(req) {
  const db = getDb();
  const body = await req.json();
  switch (body.action) {
    case 'find': {
      if (runningJob('li-recruiters')) return Response.json({ error: 'Already searching for recruiters' }, { status: 409 });
      spawnScript('li-recruiters.mjs', ['--n', String(body.n || 15), ...(body.mode ? ['--mode', body.mode] : [])]);
      break;
    }
    case 'step': {
      if (!(body.to in STEPS)) return Response.json({ error: 'unknown step' }, { status: 400 });
      const col = STEPS[body.to];
      db.prepare(`UPDATE li_contacts SET status=?, ${col ? `${col}=?, ` : ''}updated_at=? WHERE id=?`)
        .run(...[body.to, ...(col ? [nowLocal()] : []), nowLocal(), body.id]);
      break;
    }
    case 'edit':
      if (!EDITABLE.includes(body.field)) return Response.json({ error: 'bad field' }, { status: 400 });
      db.prepare(`UPDATE li_contacts SET ${body.field}=?, updated_at=? WHERE id=?`).run(body.value, nowLocal(), body.id);
      break;
    default: return Response.json({ error: 'unknown action' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
