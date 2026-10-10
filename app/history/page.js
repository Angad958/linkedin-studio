import Link from 'next/link';
import { getDb } from '@/lib/db.mjs';

export const dynamic = 'force-dynamic';

export default function History() {
  const rows = getDb().prepare("SELECT * FROM drafts WHERE status IN ('posted','rejected') ORDER BY COALESCE(posted_at, updated_at) DESC").all();
  return (
    <>
      <h1>Posted</h1>
      <p className="sub">Every post you marked as posted also goes into ~/.claude/linkedin/log.md, which <code>/li-audit</code> reads.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>Post</th><th>Format</th><th>Score</th><th>Link</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Nothing posted yet.</td></tr>}
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="small">{(d.posted_at || d.updated_at).slice(0, 10)}</td>
                <td><Link href={`/draft/${d.id}`}>{d.title}</Link><div className="muted small">{(d.text || '').split('\n')[0].slice(0, 110)}</div></td>
                <td><span className={`chip ${d.status}`}>{d.status}</span> <span className="chip">{d.media_type}</span></td>
                <td>{d.human_score}</td>
                <td>{d.posted_url ? <a href={d.posted_url} target="_blank">open ↗</a> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
