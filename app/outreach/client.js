'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import LinkedInTab from './linkedin';

const post = (body) => fetch('/api/outreach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

function EmailCard({ group, on, toggle, onSaved, canSend, confirming, onSendNow }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const first = group.msgs.find((m) => m.step === 0);
  const save = async (m) => { await post({ action: 'edit', id: m.id, subject: edit.subject, body: edit.body }); setEdit(null); onSaved(); };
  return (
    <div className={`email ${on ? '' : 'off'}`}>
      <div className="row spread">
        <label className="row" style={{ margin: 0, color: 'var(--ink)', fontSize: 15 }}>
          <input type="checkbox" checked={on} onChange={toggle} style={{ width: 18, height: 18 }} />
          <b>{group.name || '(no name)'}</b> <span className="muted">{group.email}</span>
        </label>
        <div className="row"><span className="chip">{group.company || '-'}</span><span className="chip">{group.kind}</span><span className="chip">tier {group.tier}</span></div>
      </div>
      {group.msgs.filter((m) => m.step === 0 || open).map((m) => (
        <div key={m.id} style={{ marginTop: 10 }}>
          <div className="muted small">{m.step === 0 ? 'First email (resume attached)' : m.step === 1 ? 'Follow-up · +4 days' : 'Last follow-up · +10 days'}</div>
          {edit?.id === m.id ? (
            <>
              <input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} style={{ marginTop: 6 }} />
              <textarea className="small" style={{ minHeight: 180, marginTop: 6 }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
              <div className="row" style={{ marginTop: 6 }}><button className="btn sm primary" onClick={() => save(m)}>Save</button><button className="btn sm" onClick={() => setEdit(null)}>Cancel</button></div>
            </>
          ) : (
            <div onDoubleClick={() => setEdit({ id: m.id, subject: m.subject, body: m.body })}>
              <div style={{ fontWeight: 600 }}>{m.subject}</div>
              <div className="preview small" style={{ marginTop: 4 }}>{m.body}</div>
              <a href="#" className="small" onClick={(e) => { e.preventDefault(); setEdit({ id: m.id, subject: m.subject, body: m.body }); }}>edit</a>
            </div>
          )}
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <a href="#" className="small" onClick={(e) => { e.preventDefault(); setOpen(!open); }}>{open ? 'hide follow-ups' : 'show 2 follow-ups'}</a>
        <a href="#" className="small danger" style={{ color: 'var(--bad)' }} onClick={async (e) => { e.preventDefault(); await post({ action: 'skip', contactId: first.contact_id }); onSaved(); }}>never email this contact</a>
        <span style={{ flex: 1 }} />
        <button className={`btn sm ${confirming ? 'primary' : 'ok'}`} disabled={!canSend} onClick={onSendNow}
          title={canSend ? 'Sends this first email now with your resume attached. Follow-ups still go at +4 and +10 days.' : 'Gmail is not connected'}>
          {confirming ? 'Click again to send' : '➤ Send'}
        </button>
      </div>
    </div>
  );
}

export default function OutreachClient({ stats, drafts, scheduled, pipeline, failed, job, smtp, liContacts, liJob }) {
  const router = useRouter();
  const groups = useMemo(() => {
    const m = new Map();
    for (const d of drafts) {
      if (!m.has(d.contact_id)) m.set(d.contact_id, { id: d.contact_id, email: d.email, name: d.name, company: d.company, kind: d.kind, tier: d.tier, msgs: [] });
      m.get(d.contact_id).msgs.push(d);
    }
    return [...m.values()];
  }, [drafts]);
  const [off, setOff] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [jobState, setJob] = useState(job);
  const [tab, setTab] = useState('batch');
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(''); // "Send now" needs a second click: '' | 'batch' | contact id
  const sendNow = (ids, key) => (confirm === key ? run({ action: 'sendNow', contactIds: ids }, 'sendNow') : setConfirm(key));

  useEffect(() => {
    if (jobState?.status !== 'running') return;
    const t = setInterval(async () => {
      const r = await fetch('/api/jobs').then((x) => x.json());
      const j = r.jobs.find((x) => x.id === jobState.id);
      setJob(j);
      if (j?.status !== 'running') router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [jobState?.status]);

  const run = async (body, label) => {
    setBusy(label);
    const r = await post(body);
    setBusy('');
    setErr(r.error || '');
    if (['prepare', 'sendNow'].includes(body.action) && !r.error) {
      const type = body.action === 'sendNow' ? 'send-now' : 'outreach';
      setTimeout(async () => { const j = await fetch(`/api/jobs?type=${type}`).then((x) => x.json()); setJob(j.jobs[0]); }, 800);
    }
    setConfirm('');
    router.refresh();
  };
  const upload = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    setBusy('import');
    await fetch('/api/outreach', { method: 'POST', body: fd });
    setBusy('');
    setTimeout(async () => { const j = await fetch('/api/jobs?type=import-contacts').then((x) => x.json()); setJob(j.jobs[0]); }, 800);
  };
  const approveIds = groups.filter((g) => !off.has(g.id)).map((g) => g.id);
  const s = stats.statuses;

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Recruiter outreach</h1>
          <p className="sub">Each morning 20 personalised emails get drafted. Approve the batch here and the rest is automatic: spaced-out sending, follow-ups at +4 and +10 days, and stopping as soon as someone replies.</p>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!!busy || jobState?.status === 'running' || groups.length > 0} onClick={() => run({ action: 'prepare', n: 20 }, 'prepare')} title={groups.length ? 'Approve or skip the current batch first' : ''}>Draft next 20</button>
          <label className="btn" style={{ margin: 0, color: 'var(--ink)', fontSize: 14 }}>Import CSV<input type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0])} /></label>
          {stats.paused ? <button className="btn ok" onClick={() => run({ action: 'resume' }, 'resume')}>Resume sending</button> : <button className="btn" onClick={() => run({ action: 'pause' }, 'pause')}>Pause sending</button>}
          <button className="btn" disabled={!smtp} onClick={() => run({ action: 'poll' }, 'poll')}>Check inbox</button>
        </div>
      </div>

      {!smtp && <div className="flag" style={{ fontSize: 14 }}>Gmail isn't connected yet, so nothing can be sent. Add <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> to <code>.env.local</code> (instructions are in the README). You can still draft and approve batches.</div>}
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      {stats.paused && <div className="err" style={{ marginBottom: 12 }}>{stats.paused}</div>}
      {jobState?.status === 'running' && <div className="card" style={{ marginBottom: 12 }}><b>{jobState.type}</b> running… <pre className="log">{jobState.log}</pre></div>}
      {jobState?.status === 'failed' && <div className="err" style={{ marginBottom: 12 }}>Last {jobState.type} job failed: {jobState.detail}</div>}

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat">{stats.tiers.A || 0} / {stats.tiers.B || 0}</div><div className="stat-l">Tier A / B contacts · C {stats.tiers.C || 0} · excluded {stats.tiers.X || 0}</div></div>
        <div className="card"><div className="stat">{(s.contacted || 0) + (s.replied || 0) + (s.interview || 0)}</div><div className="stat-l">Contacted · {stats.sentToday} emails sent today · {stats.queued} scheduled</div></div>
        <div className="card"><div className="stat">{(s.replied || 0) + (s.interview || 0)}</div><div className="stat-l">Replies · {s.interview || 0} interviews · {s.opted_out || 0} opted out</div></div>
        <div className="card"><div className="stat">{(stats.bounce.rate * 100).toFixed(1)}%</div><div className="stat-l">Bounce rate ({s.bounced || 0}). Tier B is used only while this stays under 3%</div></div>
      </div>

      <div className="tabs">
        {[['batch', `To approve (${groups.length})`], ['scheduled', `Scheduled (${scheduled.length})`], ['pipeline', `Pipeline (${pipeline.length})`], ['linkedin', `LinkedIn (${liContacts.length})`]].map(([k, l]) => (
          <button key={k} className={`btn sm ${tab === k ? 'primary' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'batch' && (
        <>
          {groups.length > 0 && (
            <div className="card row spread" style={{ marginBottom: 12, position: 'sticky', top: 62, zIndex: 3 }}>
              <span><b>{approveIds.length}</b> of {groups.length} selected. Approving schedules the first email (spaced 2-5 min apart, Mon-Fri 9:30-18:00) and both follow-ups.</span>
              <div className="row">
                <button className="btn ok" disabled={!approveIds.length || !!busy} onClick={() => run({ action: 'approve', contactIds: approveIds }, 'approve')}>✓ Approve {approveIds.length} &amp; schedule</button>
                <button className={`btn ${confirm === 'batch' ? 'primary' : ''}`} disabled={!smtp || !approveIds.length || !!busy} onClick={() => sendNow(approveIds, 'batch')}
                  title="Sends the first emails right away, 20-40s apart, ignoring the 9:30-18:00 window. Follow-ups still go at +4 and +10 days.">
                  {confirm === 'batch' ? `Click again to send ${approveIds.length} now` : `Send ${approveIds.length} now`}
                </button>
              </div>
            </div>
          )}
          {groups.length === 0 && <div className="card muted">No batch waiting. A new one is drafted every morning at 8:00, or click “Draft next 20”.</div>}
          {groups.map((g) => (
            <EmailCard key={g.id} group={g} on={!off.has(g.id)} onSaved={() => router.refresh()}
              canSend={smtp && !busy} confirming={confirm === g.id} onSendNow={() => sendNow([g.id], g.id)}
              toggle={() => setOff((p) => { const n = new Set(p); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })} />
          ))}
        </>
      )}

      {tab === 'linkedin' && <LinkedInTab contacts={liContacts} job={liJob} />}

      {tab === 'scheduled' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          {failed.length > 0 && <div className="err" style={{ margin: 12 }}>{failed.length} recent send failures, e.g. {failed[0].email}: {failed[0].error}</div>}
          <table><thead><tr><th>Due</th><th>To</th><th>Email</th></tr></thead><tbody>
            {scheduled.length === 0 && <tr><td colSpan={3} className="muted">Nothing scheduled.</td></tr>}
            {scheduled.map((m) => <tr key={m.id}><td className="small">{m.scheduled_at}</td><td>{m.email}<div className="muted small">{m.company}</div></td><td className="small">{m.step ? `follow-up ${m.step}` : 'first'} · {m.subject}</td></tr>)}
          </tbody></table>
        </div>
      )}

      {tab === 'pipeline' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table><thead><tr><th>Contact</th><th>Company</th><th>Emails sent</th><th>Last sent</th><th>Status</th></tr></thead><tbody>
            {pipeline.length === 0 && <tr><td colSpan={5} className="muted">No one contacted yet.</td></tr>}
            {pipeline.map((c) => (
              <tr key={c.id}>
                <td>{c.name || '-'}<div className="muted small">{c.email}</div>{c.notes && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{c.notes.trim().split('\n').pop()}</div>}</td>
                <td>{c.company}</td><td>{c.n_sent}</td><td className="small">{c.last_sent || '-'}</td>
                <td>
                  <select value={c.status} onChange={(e) => run({ action: 'status', contactId: c.id, status: e.target.value }, 'status')} style={{ padding: '4px 8px', width: 130 }}>
                    {['contacted', 'replied', 'interview', 'closed', 'opted_out', 'bounced'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </>
  );
}
