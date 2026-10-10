import { getDb } from '@/lib/db.mjs';
import { PILLARS } from '@/lib/drafts.mjs';
import TopicsClient from './client';

export const dynamic = 'force-dynamic';

export default function Topics() {
  const topics = getDb().prepare('SELECT * FROM topics ORDER BY used_at IS NOT NULL, pillar, priority DESC, id').all();
  return (
    <>
      <h1>Topic backlog</h1>
      <p className="sub">Weekday rotation: Sun case studies · Mon distributed · Tue HLD · Wed LLD · Thu incidents · Fri AI · Sat how-it-works. Higher priority goes first. ⚡ Generate now drafts any topic immediately (3-8 min) without waiting for 7:00.</p>
      <TopicsClient topics={topics} pillars={PILLARS} />
    </>
  );
}
