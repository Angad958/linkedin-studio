'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canPublish, pickMedia } from '@/lib/linkedin-format.mjs';

const mediaUrl = (id, f, dl) => `/api/media/${id}/${encodeURIComponent(f)}${dl ? '?download=1' : ''}`;

function LinkedInPreview({ d, text, handle }) {
  const [more, setMore] = useState(false);
  const media = JSON.parse(d.media_json || '[]');
  const main = media.find((m) => m.preview);
  const cut = text.length > 210 && !more;
  return (
    <div className="li">
      <div className="hd">
        <div className="av">{handle.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
        <div><div style={{ fontWeight: 600 }}>{handle}</div><div className="muted small">SDE · Distributed Systems · now</div></div>
      </div>
      <div className="tx preview">
        {cut ? `${text.slice(0, 210).trimEnd()}… ` : text}
        {text.length > 210 && <a href="#" onClick={(e) => { e.preventDefault(); setMore(!more); }} className="muted">{more ? ' show less' : 'see more'}</a>}
      </div>
      {main?.kind === 'mp4' && <video src={mediaUrl(d.id, main.file)} controls autoPlay muted loop playsInline />}
      {main?.kind === 'png' && d.media_type !== 'carousel' && <img src={mediaUrl(d.id, main.file)} alt="" />}
      {media.some((m) => m.kind === 'slide') && (
        <div className="gallery">
          {media.filter((m) => m.kind === 'slide').map((m) => <img key={m.file} src={mediaUrl(d.id, m.file)} alt={m.label} />)}
        </div>
      )}
      {d.media_type === 'carousel' && media.find((m) => m.kind === 'pdf') && (
        <div style={{ padding: 10 }} className="row"><a className="btn sm" href={mediaUrl(d.id, 'carousel.pdf')} target="_blank">Open full carousel PDF ↗</a><span className="muted small">swipe the slides above →</span></div>
      )}
    </div>
  );
}

function PublishKit({ d, text, onPosted }) {
  const [copied, setCopied] = useState('');
  const [url, setUrl] = useState('');
  const media = JSON.parse(d.media_json || '[]');
  const upload = media.find((m) => m.kind === 'pdf' || m.kind === 'mp4') || media.find((m) => m.kind === 'png');
  const copy = async (what, value) => { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied(''), 2500); };
  return (
    <div className="kit">
      <div style={{ fontWeight: 700, fontSize: 16 }}>Publish Kit</div>
      <div className="muted small">Manual fallback: copy, attach, post yourself.</div>
      <div className="step"><span className="n">1</span><button className="btn" onClick={() => copy('text', text)}>{copied === 'text' ? '✓ Copied' : 'Copy post text'}</button></div>
      {upload && (
        <div className="step"><span className="n">2</span>
          <a className="btn" href={mediaUrl(d.id, upload.file, true)}>Download {upload.kind.toUpperCase()}</a>
          <span className="muted small">{upload.kind === 'pdf' ? 'In LinkedIn: “Add a document”, then upload this PDF and give it a title' : upload.kind === 'mp4' ? 'In LinkedIn: “Add media”, then pick the video' : 'In LinkedIn: “Add media”'}</span>
        </div>
      )}
      <div className="step"><span className="n">3</span><a className="btn primary" href="https://www.linkedin.com/feed/?shareActive=true" target="_blank">Open LinkedIn composer ↗</a><span className="muted small">paste, attach, post</span></div>
      {d.first_comment && <div className="step"><span className="n">4</span><button className="btn" onClick={() => copy('fc', d.first_comment)}>{copied === 'fc' ? '✓ Copied' : 'Copy first comment'}</button><span className="muted small">post it as the first comment right after publishing</span></div>}
      <div className="step"><span className="n">{d.first_comment ? 5 : 4}</span>
        <input placeholder="Paste the post URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} style={{ maxWidth: 340 }} />
        <button className="btn ok" onClick={() => onPosted(url)}>Mark as posted</button>
      </div>
    </div>
  );
}

const MEDIA_LABEL = { document: 'carousel PDF', video: 'video', image: 'image', none: 'no media (text only)' };

function PostToLinkedIn({ d, li, busy, stuck, onPublish, onSkipComment }) {
  const [confirming, setConfirming] = useState(false);
  const m = pickMedia(d);
  const retryComment = Boolean(d.li_post_urn);
  if (!li.connected) {
    return <div className="kit"><b>Post to LinkedIn</b><div className="muted small">LinkedIn isn't connected. <Link href="/settings">Connect it in Settings</Link>, or use the manual kit below.</div></div>;
  }
  return (
    <div className="kit">
      <div style={{ fontWeight: 700, fontSize: 16 }}>{retryComment ? 'Finish posting' : 'Post to LinkedIn'}</div>
      <div className="muted small">As {li.name} · {MEDIA_LABEL[m.type]}{d.first_comment ? ' · first comment posted right after' : ''}</div>
      {stuck && <div className="small">The last attempt stopped before finishing. Retrying is safe: it never posts twice.</div>}
      {!confirming ? (
        <div className="step">
          <button className="btn primary" disabled={!!busy || !canPublish(d)} onClick={() => setConfirming(true)}>{retryComment ? 'Retry first comment' : 'Post to LinkedIn'}</button>
          {retryComment && <button className="btn" disabled={!!busy} onClick={onSkipComment}>Skip comment, mark as posted</button>}
        </div>
      ) : (
        <div className="step">
          <span>{retryComment ? 'Post the first comment now?' : 'This goes live publicly right now. Post it?'}</span>
          <button className="btn ok" disabled={!!busy} onClick={() => { setConfirming(false); onPublish(); }}>Yes, post</button>
          <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function DraftEditor({ initial, job: initialJob, handle, li, jobActive }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [text, setText] = useState(initial.text || '');
  const [firstComment, setFirstComment] = useState(initial.first_comment || '');
  const [chosen, setChosen] = useState(initial.chosen_hook ?? 0);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [job, setJob] = useState(initialJob);
  const [startedHere, setStartedHere] = useState(false);
  const hooks = JSON.parse(d.hooks_json || '[]');
  const flags = JSON.parse(d.flags_json || '[]');
  const dirty = text !== (d.text || '') || firstComment !== (d.first_comment || '') || chosen !== (d.chosen_hook ?? 0);
  const len = text.length;

  useEffect(() => {
    if (!['generating', 'publishing'].includes(d.status)) return;
    if (d.status === 'publishing' && !jobActive && !startedHere) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs?type=${d.status === 'publishing' ? 'publish' : 'generate'}`).then((x) => x.json());
      const j = r.jobs.find((x) => x.detail?.startsWith(`draft ${d.id}`));
      if (j) setJob(j);
      if (j && j.status !== 'running') { clearInterval(t); router.refresh(); setTimeout(() => window.location.reload(), 300); }
    }, 4000);
    return () => clearInterval(t);
  }, [d.status, startedHere]);

  // Never leave a button stuck on "Saving…": any failure (404, HTML error page, network) becomes an error banner.
  const call = async (method, body) => {
    try {
      const res = await fetch(`/api/drafts/${d.id}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.draft) return { error: r.error || `Request failed (${res.status} ${res.statusText})` };
      return r;
    } catch (e) {
      return { error: `Request failed: ${e.message}` };
    }
  };
  const save = async (clean = false) => {
    setBusy('save');
    const r = await call('PATCH', { text, first_comment: firstComment, chosen_hook: chosen, clean });
    setBusy('');
    if (r.error) { setD((cur) => ({ ...cur, error: r.error })); return null; }
    setD(r.draft); setText(r.draft.text);
    return r.draft;
  };
  const act = async (action, extra = {}) => {
    if (dirty && ['approve'].includes(action) && !(await save())) return;
    setBusy(action);
    const r = await call('POST', { action, ...extra });
    if (r.error) { setBusy(''); setD((cur) => ({ ...cur, error: r.error })); return; }
    if (action === 'publish') setStartedHere(true);
    setD(r.draft); setBusy('');
    if (action === 'reject') router.push('/');
    router.refresh();
  };
  const pickHook = (i) => {
    const lines = text.split('\n');
    lines[0] = hooks[i].line;
    setText(lines.join('\n'));
    setChosen(i);
  };

  if (d.status === 'generating') {
    return (
      <div className="card">
        <h1>Generating… <span className="chip generating">running</span></h1>
        <p className="sub">{d.title}. Claude is writing the post, building the media and running the humanizer. This takes 3-8 minutes.</p>
        <pre className="log">{job?.log || 'starting…'}</pre>
      </div>
    );
  }

  // A publish job that died leaves the draft in 'publishing'; show the post controls again instead of a dead log.
  const stuck = d.status === 'publishing' && !jobActive && !startedHere;
  if (d.status === 'publishing' && !stuck) {
    return (
      <div className="card">
        <h1>Posting to LinkedIn… <span className="chip publishing">publishing</span></h1>
        <p className="sub">{d.title}. Uploading media and creating the post. Videos can take a few minutes.</p>
        <pre className="log">{job?.log || 'starting…'}</pre>
      </div>
    );
  }

  return (
    <>
      <div className="row spread">
        <div>
          <Link href="/" className="small">← Queue</Link>
          <h1>{d.title}</h1>
          <div className="row"><span className={`chip ${d.status}`}>{d.status}</span><span className="chip">{d.pillar}</span><span className="chip">{d.media_type}</span><span className="muted small">for {d.for_date}</span></div>
        </div>
        <div className="row">
          {d.status === 'pending' && <button className="btn ok" disabled={!!busy} onClick={() => act('approve')}>✓ Approve</button>}
          {d.status === 'approved' && !d.li_post_urn && <button className="btn" disabled={!!busy} onClick={() => act('unapprove')}>Back to edit</button>}
          {['pending', 'approved', 'failed'].includes(d.status) && <button className="btn danger" disabled={!!busy} onClick={() => act('reject')}>Reject</button>}
        </div>
      </div>
      {d.error && <div className="err" style={{ margin: '12px 0' }}>{d.error}</div>}
      {(d.status === 'approved' || stuck) && (
        <div style={{ margin: '16px 0' }} className="grid">
          <PostToLinkedIn d={d} li={li} busy={busy} stuck={stuck} onPublish={() => act('publish')} onSkipComment={() => act('skip_comment')} />
          {!d.li_post_urn && <details><summary className="small muted">Post manually instead</summary><div style={{ marginTop: 10 }}><PublishKit d={d} text={text} onPosted={(url) => act('posted', { url })} /></div></details>}
        </div>
      )}
      {d.status === 'posted' && <div className="okbox" style={{ margin: '16px 0' }}>Posted {d.posted_at}{d.posted_url && <> · <a href={d.posted_url} target="_blank">view on LinkedIn ↗</a></>}. Logged to ~/.claude/linkedin/log.md.</div>}

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          {hooks.length > 0 && (
            <>
              <label style={{ marginTop: 0 }}>Hook options (click to swap the first line)</label>
              {hooks.map((h, i) => (
                <div key={i} className={`hook ${chosen === i ? 'on' : ''}`} onClick={() => d.status === 'pending' && pickHook(i)}>
                  <div className="small muted">#{h.n} {h.formula}{chosen === i ? ' · in use' : ''}</div>
                  <div>{h.line}</div>
                </div>
              ))}
            </>
          )}
          <div className="row spread"><label>Post text</label><span className={`small ${len < 900 || len > 1300 ? 'muted' : ''}`}>{len} chars (aim for 900-1,300)</span></div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={d.status !== 'pending'} />
          <label>First comment (links go here, not in the post)</label>
          <textarea className="small" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} disabled={d.status !== 'pending'} placeholder="optional" />
          {d.status === 'pending' && (
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={!dirty || !!busy} onClick={() => save()}>{busy === 'save' ? 'Saving…' : 'Save & re-score'}</button>
              <button className="btn" disabled={!!busy} onClick={() => save(true)} title="Runs humanize.py: em dashes, curly quotes, slop words">Auto-clean</button>
            </div>
          )}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <LinkedInPreview d={d} text={text} handle={handle} />
          <div className="card">
            <div className="row spread">
              <div><span className="muted small">Human score</span> <span className={`chip ${d.human_verdict}`}>{d.human_score ?? '-'} {d.human_verdict}</span></div>
              <a href="#" className="small" onClick={(e) => { e.preventDefault(); setShowReport(!showReport); }}>{showReport ? 'hide' : 'details'}</a>
            </div>
            {showReport && <pre className="log">{d.human_report}</pre>}
            {flags.length > 0 && <><label>Check before posting</label>{flags.map((f, i) => <div key={i} className={`flag ${f.startsWith('Media:') ? 'media' : ''}`}>{f}</div>)}</>}
            <label>Media files</label>
            <div className="row">{JSON.parse(d.media_json || '[]').filter((m) => m.kind !== 'slide').map((m) => <a key={m.file} className="btn sm" href={mediaUrl(d.id, m.file, true)}>{m.label}</a>)}</div>
          </div>
          {['pending', 'failed'].includes(d.status) && (
            <div className="card">
              <label style={{ marginTop: 0 }}>Regenerate with feedback</label>
              <textarea className="small" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. go deeper on the failure mode, make it a carousel instead, shorter hook…" />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" disabled={!!busy} onClick={() => act('regenerate', { feedback, part: 'all' })}>Rewrite everything</button>
                <button className="btn" disabled={!!busy} onClick={() => act('regenerate', { feedback, part: 'media' })}>Redo media only</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
