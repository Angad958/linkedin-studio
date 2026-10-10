'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TopicsClient({ topics, pillars }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', pillar: 'hld', media_hint: 'any', priority: 5 });
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const generate = async (body, key) => {
    setBusyId(key);
    const r = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
    if (r.draftId) router.push(`/draft/${r.draftId}`); else setBusyId(null);
  };
  const call = async (method, body) => { await fetch('/api/topics', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); router.refresh(); };
  const shown = topics.filter((t) => filter === 'all' || t.pillar === filter);
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) repeat(3,minmax(0,1fr))', alignItems: 'end' }}>
          <div><label>New topic</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Design a distributed rate limiter for 1M RPS" /></div>
          <div><label>Pillar</label><select value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value })}>{Object.keys(pillars).map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><label>Media</label><select value={form.media_hint} onChange={(e) => setForm({ ...form, media_hint: e.target.value })}>{['any', 'carousel', 'animation', 'diagram'].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><label>Priority</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
          <div className="row" style={{ gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={async () => { await call('POST', form); setForm({ ...form, title: '' }); }} disabled={!form.title.trim()}>Add to backlog</button>
            <button className="btn primary" onClick={() => generate({ title: form.title, pillar: form.pillar, media: form.media_hint }, 'new')} disabled={!form.title.trim() || busyId === 'new'}>{busyId === 'new' ? 'Starting…' : '⚡ Add & generate now'}</button>
          </div>
        </div>
      </div>
      <div className="tabs">{['all', ...Object.keys(pillars)].map((p) => <button key={p} className={`btn sm ${filter === p ? 'primary' : ''}`} onClick={() => setFilter(p)}>{p}</button>)}</div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Topic</th><th>Pillar</th><th>Media</th><th>Priority</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id} style={{ opacity: t.used_at ? 0.5 : 1 }}>
                <td>{t.title}</td><td><span className="chip">{t.pillar}</span></td><td className="small">{t.media_hint}</td>
                <td><input type="number" defaultValue={t.priority} style={{ width: 70, padding: '4px 8px' }} onBlur={(e) => Number(e.target.value) !== t.priority && call('PATCH', { id: t.id, priority: e.target.value })} /></td>
                <td className="small">{t.used_at ? `used ${t.used_at.slice(0, 10)}` : 'queued'}</td>
                <td className="row" style={{ flexWrap: 'nowrap' }}><button className="btn sm primary" disabled={busyId === t.id} onClick={() => generate({ topicId: t.id }, t.id)}>{busyId === t.id ? 'Starting…' : '⚡ Generate now'}</button>{t.used_at && <button className="btn sm" onClick={() => call('PATCH', { id: t.id, reset: true })}>reuse</button>}<button className="btn sm danger" onClick={() => call('DELETE', { id: t.id })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
