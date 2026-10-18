'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const post = (body) => fetch('/api/li-outreach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const daysSince = (ts) => (ts ? (Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 864e5 : 0);
const INVITES_PER_DAY = 20;

// What the user has to do next for a contact: which text to send and which step it moves to.
function nextAction(c) {
  switch (c.status) {
    case 'drafted': return { field: 'note', label: 'Connection note', to: 'invited', done: 'Invite sent', due: true };
    case 'invited': return { field: null, label: 'Waiting for them to accept', to: 'connected', done: 'They accepted', due: false };
    case 'connected': return { field: 'dm', label: 'First message', to: 'messaged', done: 'Message sent', due: true };
    case 'messaged': return { field: 'followup1', label: 'Follow-up (+4 days)', to: 'followed1', done: 'Follow-up sent', due: daysSince(c.dm_sent_at) >= 4 };
    case 'followed1': return { field: 'followup2', label: 'Last follow-up (+10 days)', to: 'followed2', done: 'Last note sent', due: daysSince(c.dm_sent_at) >= 10 };
    default: return null;
  }
}

function Card({ c, invitesLeft, onChange }) {
  const act = nextAction(c);
  const [text, setText] = useState(act?.field ? c[act.field] || '' : '');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setText(act?.field ? c[act.field] || '' : ''); }, [c.id, c.status]);
  const save = () => act?.field && text !== c[act.field] && post({ action: 'edit', id: c.id, field: act.field, value: text });
  const copy = async () => { await save(); await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const step = async (to) => { await save(); await post({ action: 'step', id: c.id, to }); onChange(); };
  const over = act?.field === 'note' && text.length > 200;
  const blocked = c.status === 'drafted' && invitesLeft <= 0;

  return (
    <div className="email">
      <div className="row spread">
        <div><b>{c.name}</b> <span className="muted small">{c.title}</span></div>
        <div className="row"><span className="chip">{c.company || '-'}</span><span className="chip">{c.mode}</span><span className="chip">tier {c.tier}</span></div>
      </div>
      {c.evidence && <div className="muted small" style={{ marginTop: 4 }}>{c.evidence}</div>}
      {act && (
        <div style={{ marginTop: 10 }}>
          <div className="muted small">{act.label}{act.field === 'note' && <> · <span style={{ color: over ? 'var(--bad)' : undefined }}>{text.length}/200</span></>}
            {act.field && !act.due && ` · due in ${Math.ceil((act.to === 'followed1' ? 4 : 10) - daysSince(c.dm_sent_at))} days`}</div>
          {act.field && <textarea className="small" style={{ minHeight: act.field === 'note' ? 70 : 120, marginTop: 6 }} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} />}
          <div className="row" style={{ marginTop: 6 }}>
            <a className="btn sm" href={c.profile_url} target="_blank" rel="noreferrer">Open profile ↗</a>
            {act.field && <button className="btn sm" onClick={copy} disabled={over}>{copied ? 'Copied ✓' : 'Copy'}</button>}
            <button className="btn sm ok" disabled={(act.field && !act.due) || over || blocked} onClick={() => step(act.to)}
              title={blocked ? `${INVITES_PER_DAY} invites a day is LinkedIn's safe limit` : ''}>✓ {act.done}</button>
            <span style={{ flex: 1 }} />
            {c.status !== 'drafted' && <a href="#" className="small" onClick={(e) => { e.preventDefault(); step('replied'); }}>they replied</a>}
            <a href="#" className="small" style={{ color: 'var(--bad)' }} onClick={(e) => { e.preventDefault(); step('skipped'); }}>skip</a>
          </div>
        </div>
      )}
      {!act && <div className="muted small" style={{ marginTop: 6 }}>{c.status}{c.updated_at ? ` · ${c.updated_at}` : ''} · <a href={c.profile_url} target="_blank" rel="noreferrer">profile ↗</a></div>}
    </div>
  );
}

export default function LinkedInTab({ contacts, job: initialJob }) {
  const router = useRouter();
  const [mode, setMode] = useState('all');
  const [job, setJob] = useState(initialJob);
  const [err, setErr] = useState('');
  const today = new Date().toLocaleDateString('sv');
  const invitesToday = contacts.filter((c) => c.invited_at?.startsWith(today)).length;
  const invitesLeft = INVITES_PER_DAY - invitesToday;

  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setInterval(async () => {
      const r = await fetch('/api/jobs?type=li-recruiters').then((x) => x.json());
      setJob(r.jobs[0]);
      if (r.jobs[0]?.status !== 'running') router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [job?.status]);

  const find = async (m) => {
    const r = await post({ action: 'find', n: 15, mode: m === 'all' ? '' : m });
    setErr(r.error || '');
    if (!r.error) setTimeout(async () => { const j = await fetch('/api/jobs?type=li-recruiters').then((x) => x.json()); setJob(j.jobs[0]); }, 800);
  };

  const groups = useMemo(() => {
    const shown = contacts.filter((c) => mode === 'all' || c.mode === mode);
    const g = { now: [], invite: [], waiting: [], done: [] };
    for (const c of shown) {
      const a = nextAction(c);
      if (!a) g.done.push(c);
      else if (c.status === 'drafted') g.invite.push(c);
      else if (a.field && a.due) g.now.push(c);
      else g.waiting.push(c);
    }
    return g;
  }, [contacts, mode]);

  const section = (title, list, hint) => list.length > 0 && (
    <>
      <h3 style={{ margin: '18px 0 8px' }}>{title} <span className="muted small">({list.length}){hint ? ` · ${hint}` : ''}</span></h3>
      {list.map((c) => <Card key={c.id} c={c} invitesLeft={invitesLeft} onChange={() => router.refresh()} />)}
    </>
  );

  return (
    <>
      <div className="card row spread" style={{ marginBottom: 12 }}>
        <span className="small">LinkedIn doesn't allow apps to send invites or DMs, so you send each one: <b>Open profile → Connect → Add a note → paste → Send</b>, then tick it here. Invites today: <b>{invitesToday}/{INVITES_PER_DAY}</b>.</span>
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: '4px 8px', width: 120 }}>
            {['all', 'remote', 'hybrid', 'onsite'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <button className="btn primary" disabled={job?.status === 'running'} onClick={() => find(mode === 'hybrid' ? 'all' : mode)}>
            Find 15 {mode === 'remote' || mode === 'onsite' ? `${mode} ` : ''}recruiters
          </button>
        </div>
      </div>
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      {job?.status === 'running' && <div className="card" style={{ marginBottom: 12 }}><b>Finding recruiters…</b> takes 3-6 minutes. <pre className="log">{job.log}</pre></div>}
      {job?.status === 'failed' && <div className="err" style={{ marginBottom: 12 }}>Last search failed: {job.detail}</div>}
      {job?.status === 'done' && job.detail && <div className="muted small" style={{ marginBottom: 8 }}>Last search: {job.detail}</div>}
      {contacts.length === 0 && <div className="card muted">No recruiters yet. Click “Find 15 recruiters”. Each one comes with a connection note, a first message and two follow-ups written from your resume.</div>}
      {section('Do now', groups.now, 'accepted invites and follow-ups that are due')}
      {section('To invite', groups.invite, invitesLeft > 0 ? `${invitesLeft} invites left today` : 'daily limit reached, continue tomorrow')}
      {section('Waiting', groups.waiting)}
      {section('Done', groups.done)}
    </>
  );
}
