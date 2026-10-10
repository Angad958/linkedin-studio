'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function GenerateButton() {
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const poll = async () => {
    const r = await fetch('/api/jobs?type=generate').then((x) => x.json());
    const j = r.jobs[0];
    setJob(j || null);
    return j;
  };
  useEffect(() => { poll(); }, []);
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setInterval(async () => { const j = await poll(); if (j?.status !== 'running') router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [job?.status]);
  const start = async () => {
    setErr('');
    const r = await fetch('/api/generate', { method: 'POST' }).then((x) => x.json());
    if (r.error) setErr(r.error);
    setTimeout(poll, 800);
    router.refresh();
  };
  const running = job?.status === 'running';
  return (
    <div style={{ textAlign: 'right' }}>
      <button className="btn primary" onClick={start} disabled={running}>{running ? 'Generating… (3-8 min)' : '+ Generate next draft'}</button>
      {running && <div className="muted small" style={{ marginTop: 6, maxWidth: 360 }}>{job.log.trim().split('\n').pop()}</div>}
      {err && <div className="err" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}
