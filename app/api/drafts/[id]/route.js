import fs from 'node:fs';
import path from 'node:path';
import { getDb, nowLocal } from '@/lib/db.mjs';
import { appendPostLog } from '@/lib/drafts.mjs';
import { humanizeText, scoreText } from '@/lib/human.mjs';
import { spawnScript } from '@/lib/jobs.mjs';
import { getAuth } from '@/lib/linkedin.mjs';
import { canPublish } from '@/lib/linkedin-format.mjs';
import { activePublishJob, markPostedFromUrn } from '@/lib/publish-state.mjs';

export const dynamic = 'force-dynamic';

const load = (id) => getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(id);
const conflict = (error) => Response.json({ error }, { status: 409 });

// PATCH { text, first_comment, chosen_hook, clean } -> save edits (clean runs the li-human cleanup), re-score
export async function PATCH(req, { params }) {
  const id = Number((await params).id);
  const d = load(id);
  if (!d) return Response.json({ error: 'draft not found' }, { status: 404 });
  if (d.status !== 'pending') return conflict(`Only pending drafts can be edited (this one is ${d.status}).`);
  const body = await req.json().catch(() => ({}));
  let text = body.text ?? d.text ?? '';
  if (body.clean) text = humanizeText(text);
  const human = scoreText(text);
  getDb().prepare('UPDATE drafts SET text=?, first_comment=?, chosen_hook=?, human_score=?, human_verdict=?, human_report=?, updated_at=? WHERE id=?')
    .run(text, body.first_comment ?? d.first_comment ?? '', body.chosen_hook ?? d.chosen_hook ?? 0, human.score, human.verdict, human.report, nowLocal(), id);
  // Keep post.txt in sync so a later "Redo media only" sees the edited text.
  if (d.dir && fs.existsSync(d.dir)) fs.writeFileSync(path.join(d.dir, 'post.txt'), `${text}\n`);
  return Response.json({ draft: load(id) });
}

// POST { action: approve | unapprove | reject | publish | skip_comment | posted {url} | regenerate {feedback, part} }
export async function POST(req, { params }) {
  const id = Number((await params).id);
  const db = getDb();
  const d = load(id);
  if (!d) return Response.json({ error: 'draft not found' }, { status: 404 });
  const { action, ...body } = await req.json().catch(() => ({}));
  if (d.li_post_urn && ['unapprove', 'reject', 'regenerate'].includes(action)) return conflict('Already on LinkedIn. Delete it there first.');
  const setStatus = (status) => db.prepare('UPDATE drafts SET status=?, error=NULL, updated_at=? WHERE id=?').run(status, nowLocal(), id);

  if (action === 'approve') {
    if (d.status !== 'pending') return conflict(`Only pending drafts can be approved (this one is ${d.status}).`);
    setStatus('approved');
  } else if (action === 'unapprove') {
    if (d.status !== 'approved') return conflict(`This draft is ${d.status}, not approved.`);
    setStatus('pending');
  } else if (action === 'reject') {
    if (!['pending', 'approved', 'failed'].includes(d.status)) return conflict(`A ${d.status} draft can't be rejected.`);
    setStatus('rejected');
  } else if (action === 'publish') {
    if (!canPublish(d, Boolean(activePublishJob(id)))) return conflict(`Only approved drafts can be posted (this one is ${d.status}).`);
    if (!getAuth()) return conflict('Connect LinkedIn in Settings first.');
    setStatus('publishing');
    spawnScript('publish.mjs', ['--draft', String(id)]);
  } else if (action === 'skip_comment') {
    if (!markPostedFromUrn(id)) return conflict('Nothing was posted to LinkedIn yet.');
    appendPostLog(load(id));
  } else if (action === 'posted') {
    if (!['approved', 'publishing'].includes(d.status)) return conflict(`Only approved drafts can be marked posted (this one is ${d.status}).`);
    db.prepare("UPDATE drafts SET status='posted', posted_url=?, posted_at=?, error=NULL, updated_at=? WHERE id=?")
      .run(body.url?.trim() || null, nowLocal(), nowLocal(), id);
    appendPostLog(load(id));
  } else if (action === 'regenerate') {
    if (!['pending', 'failed'].includes(d.status)) return conflict(`Only pending drafts can be regenerated (this one is ${d.status}).`);
    db.prepare("UPDATE drafts SET status='generating', error=NULL, updated_at=? WHERE id=?").run(nowLocal(), id);
    const args = ['--draft', String(id), '--part', body.part === 'media' ? 'media' : 'all'];
    if (body.feedback?.trim()) args.push('--feedback', body.feedback.trim());
    spawnScript('generate.mjs', args);
  } else {
    return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
  }
  return Response.json({ draft: load(id) });
}
