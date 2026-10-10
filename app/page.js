import Link from 'next/link';
import { getDb } from '@/lib/db.mjs';
import { authStatus } from '@/lib/linkedin.mjs';
import { mediaUrl } from '@/lib/drafts.mjs';
import { outreachStats } from '@/lib/outreach.mjs';
import GenerateButton from './generate-button';

export const dynamic = 'force-dynamic';

function thumb(d) {
  const media = JSON.parse(d.media_json || '[]');
  const p = media.find((m) => m.kind === 'png' || m.kind === 'slide') || null;
  if (p) return <img className="thumb" src={mediaUrl(d.id, p.file)} alt="" />;
  const v = media.find((m) => m.kind === 'gif');
  return v ? <img className="thumb" src={mediaUrl(d.id, v.file)} alt="" /> : <div className="thumb" />;
}

export default function Home() {
  const db = getDb();
  const drafts = db.prepare("SELECT * FROM drafts WHERE status IN ('pending','approved','publishing','generating','failed') ORDER BY for_date, id").all();
  const posted = db.prepare("SELECT COUNT(*) n FROM drafts WHERE status='posted'").get().n;
  const left = db.prepare("SELECT COUNT(*) n FROM topics WHERE used_at IS NULL").get().n;
  const o = outreachStats();
  const li = authStatus();
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Approval queue</h1>
          <p className="sub">A new draft arrives every morning at 7:00. Review it, approve it, then post it to LinkedIn.</p>
        </div>
        <GenerateButton />
      </div>
      {(!li.connected || li.daysLeft < 7) && (
        <div className="err" style={{ marginBottom: 16 }}>
          {li.connected ? `LinkedIn sign-in expires in ${li.daysLeft} days.` : 'LinkedIn is not connected.'} <Link href="/settings">Connect in Settings</Link>
        </div>
      )}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <div className="card"><div className="stat">{drafts.filter((d) => d.status === 'pending').length}</div><div className="stat-l">Waiting for approval</div></div>
        <div className="card"><div className="stat">{drafts.filter((d) => d.status === 'approved').length}</div><div className="stat-l">Approved, not posted yet</div></div>
        <div className="card"><div className="stat">{posted}</div><div className="stat-l">Posted · {left} topics left</div></div>
        <Link href="/outreach" className="card" style={{ color: 'inherit' }}><div className="stat">{o.pendingApproval}</div><div className="stat-l">Recruiter emails to approve · {o.sentToday} sent today</div></Link>
      </div>
      <div className="card list" style={{ padding: 0 }}>
        {drafts.length === 0 && <div style={{ padding: 18 }} className="muted">Nothing in the queue. Hit “Generate next draft”.</div>}
        {drafts.map((d) => (
          <Link key={d.id} href={`/draft/${d.id}`} className="item">
            {thumb(d)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row"><span className={`chip ${d.status}`}>{d.status}</span><span className="chip">{d.pillar}</span>{d.media_type && <span className="chip">{d.media_type}</span>}<span className="muted small">{d.for_date}</span></div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{d.title}</div>
              <div className="muted small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.error || (d.text || '').split('\n')[0]}</div>
            </div>
            {d.human_verdict && <span className={`chip ${d.human_verdict}`}>{d.human_score} {d.human_verdict}</span>}
          </Link>
        ))}
      </div>
    </>
  );
}
