import { notFound } from 'next/navigation';
import { config } from '@/lib/config.mjs';
import { getDb } from '@/lib/db.mjs';
import { authStatus } from '@/lib/linkedin.mjs';
import { activePublishJob } from '@/lib/publish-state.mjs';
import DraftEditor from './editor';

export const dynamic = 'force-dynamic';

export default async function DraftPage({ params }) {
  const { id } = await params;
  const d = getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(Number(id));
  if (!d) notFound();
  const type = d.status === 'publishing' ? 'publish' : 'generate';
  const job = getDb().prepare('SELECT * FROM jobs WHERE type=? AND detail LIKE ? ORDER BY id DESC LIMIT 1').get(type, `draft ${d.id}:%`);
  return <DraftEditor initial={d} job={job || null} handle={config.handle} frame={config.postFrame} li={authStatus()} jobActive={Boolean(activePublishJob(d.id))} />;
}
