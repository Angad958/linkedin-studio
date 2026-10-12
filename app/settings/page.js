import fs from 'node:fs';
import path from 'node:path';
import { LI_DIR, ROOT, config, smtpReady } from '@/lib/config.mjs';
import { getDb } from '@/lib/db.mjs';
import { authStatus, linkedinConfigured } from '@/lib/linkedin.mjs';

export const dynamic = 'force-dynamic';

const Row = ({ k, v, ok }) => (
  <tr><td style={{ width: 260 }} className="muted">{k}</td><td>{ok === undefined ? null : <span className={`chip ${ok ? 'PASS' : 'FLAGGED'}`}>{ok ? 'ok' : 'missing'}</span>} {v}</td></tr>
);

export default async function Settings({ searchParams }) {
  const sp = await searchParams;
  const li = authStatus();
  const voice = path.join(LI_DIR, 'voice.md');
  const jobs = getDb().prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 8').all();
  const launchd = ['generate', 'outreach', 'sender', 'web'].map((n) => [n, fs.existsSync(path.join(process.env.HOME, 'Library/LaunchAgents', `com.manav.linkedin-studio.${n}.plist`))]);
  return (
    <>
      <h1>Settings</h1>
      <p className="sub">Secrets live in <code>{path.join(ROOT, '.env.local')}</code>. Edit that file and restart the app to change them.</p>
      <h2>LinkedIn</h2>
      {sp?.linkedin === 'connected' && <div className="okbox" style={{ marginBottom: 12 }}>LinkedIn connected.</div>}
      {sp?.linkedin === 'error' && <div className="err" style={{ marginBottom: 12 }}>{sp.msg || 'LinkedIn sign-in failed.'}</div>}
      <div className="card row spread" style={{ marginBottom: 20 }}>
        {li.connected ? (
          <>
            <div>Connected as <b>{li.name}</b> <span className="muted small">· token expires {new Date(li.expiresAt).toLocaleDateString()} ({li.daysLeft} days)</span></div>
            <div className="row">
              <a className="btn" href="/api/linkedin/connect">Reconnect</a>
              <form action="/api/linkedin/disconnect" method="post"><button className="btn danger">Disconnect</button></form>
            </div>
          </>
        ) : (
          <>
            <div>
              <div>Not connected. Approved posts can only go out through the manual Publish Kit.</div>
              {!linkedinConfigured() && <div className="muted small">First add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env.local (see docs/superpowers/specs/2026-10-10-linkedin-direct-publish-design.md, “One-time setup”) and restart.</div>}
            </div>
            <a className="btn primary" href="/api/linkedin/connect">Connect LinkedIn</a>
          </>
        )}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table><tbody>
          <Row k="Voice profile" v={voice} ok={fs.existsSync(voice)} />
          <Row k="Gmail (SMTP + IMAP)" v={config.gmailUser || 'set GMAIL_USER and GMAIL_APP_PASSWORD'} ok={smtpReady()} />
          <Row k="Resume attachment" v={config.resumePath} ok={fs.existsSync(config.resumePath)} />
          <Row k="Display name / handle" v={config.handle} />
          <Row k="Target roles" v={config.targetRoles} />
          <Row k="New recruiter emails per batch" v={config.newPerDay} />
          <Row k="Max emails per day (incl. follow-ups)" v={config.totalCapPerDay} />
          <Row k="Send window" v={`Mon-Fri ${config.sendWindow[0]}:00-${config.sendWindow[1]}:00 local, ${config.minGapMin}-${config.maxGapMin} min apart`} />
          <Row k="#OpenToWork hashtag" v={process.env.OPEN_TO_WORK_TAG === 'false' ? 'off' : 'on'} />
          {launchd.map(([n, ok]) => <Row key={n} k={`Schedule: ${n}`} v={`com.manav.linkedin-studio.${n}`} ok={ok} />)}
        </tbody></table>
      </div>
      <h2>Recent jobs</h2>
      <div className="grid">
        {jobs.map((j) => (
          <details key={j.id} className="card">
            <summary className="row"><span className={`chip ${j.status === 'done' ? 'PASS' : j.status === 'failed' ? 'FLAGGED' : 'REVIEW'}`}>{j.status}</span><b>{j.type}</b><span className="muted small">{j.started_at}</span><span className="small">{j.detail}</span></summary>
            <pre className="log">{j.log}</pre>
          </details>
        ))}
      </div>
    </>
  );
}
