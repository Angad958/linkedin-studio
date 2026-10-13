import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '@/lib/config.mjs';
import { getDb, kvSet, nowLocal } from '@/lib/db.mjs';
import { runningJob, spawnScript } from '@/lib/jobs.mjs';

export async function POST(req) {
  const db = getDb();
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!file) return Response.json({ error: 'no file' }, { status: 400 });
    const dest = path.join(DATA_DIR, `import-${Date.now()}.csv`);
    fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
    spawnScript('clean-contacts.mjs', [dest]);
    return Response.json({ ok: true });
  }
  const body = await req.json().catch(() => ({}));
  switch (body.action) {
    case 'prepare': {
      if (runningJob('outreach')) return Response.json({ error: 'A batch is already being written' }, { status: 409 });
      spawnScript('outreach.mjs', ['--n', String(body.n || 20)]);
      break;
    }
    case 'approve': {
      // Approve all three steps for the given contacts. First email is due now; follow-ups get scheduled once it's sent.
      const ids = body.contactIds || [];
      db.transaction(() => {
        for (const id of ids) {
          db.prepare("UPDATE messages SET status='approved', scheduled_at=? WHERE contact_id=? AND step=0 AND status='draft'").run(nowLocal(), id);
          db.prepare("UPDATE messages SET status='approved', scheduled_at=NULL WHERE contact_id=? AND step>0 AND status='draft' AND length(body)>0").run(id);
        }
      })();
      break;
    }
    case 'edit':
      db.prepare("UPDATE messages SET subject=?, body=? WHERE id=? AND status IN ('draft','approved')").run(body.subject, body.body, body.id);
      break;
    case 'skip':
      db.prepare("UPDATE messages SET status='cancelled' WHERE contact_id=? AND status IN ('draft','approved')").run(body.contactId);
      db.prepare("UPDATE contacts SET status='skipped', updated_at=? WHERE id=?").run(nowLocal(), body.contactId);
      break;
    case 'status':
      db.prepare('UPDATE contacts SET status=?, updated_at=? WHERE id=?').run(body.status, nowLocal(), body.contactId);
      if (['replied', 'interview', 'closed', 'opted_out'].includes(body.status)) {
        db.prepare("UPDATE messages SET status='cancelled' WHERE contact_id=? AND status IN ('draft','approved')").run(body.contactId);
      }
      break;
    case 'pause': kvSet('sender_paused', 'Paused by you.'); break;
    case 'resume': kvSet('sender_paused', null); break;
    case 'poll': spawnScript('send-due.mjs', ['--poll-only', '--force-poll']); break;
    default: return Response.json({ error: 'unknown action' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
