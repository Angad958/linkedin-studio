// Runs every 2 minutes (launchd). Sends at most ONE approved email per run, respecting the send window,
// weekday-only sending, daily caps and a random gap. Every 30 minutes it also checks the inbox for replies/bounces.
// Usage: node scripts/send-due.mjs [--poll-only] [--force-poll]
import { config, smtpReady } from '../lib/config.mjs';
import { addDaysLocal, getDb, kvGet, kvSet, nowLocal, todayLocal } from '../lib/db.mjs';
import { scanInbox, sendMail, sendToSelf } from '../lib/mailer.mjs';
import { macNotify } from '../lib/notify.mjs';
import { OPT_OUT, bounceStats } from '../lib/outreach.mjs';

const db = getDb();
const argv = process.argv.slice(2);
const now = new Date();
const hour = now.getHours() + now.getMinutes() / 60;
const weekday = process.env.SEND_ANY_DAY === '1' || (now.getDay() >= 1 && now.getDay() <= 5);
const inWindow = weekday && hour >= config.sendWindow[0] && hour < config.sendWindow[1];

const EMAIL_RE = /[a-z0-9][a-z0-9._%+'-]*@(?:[a-z0-9-]+\.)+[a-z]{2,24}/gi;
const PERSONAL = /^(gmail|yahoo|rediffmail|hotmail|outlook|live|ymail|icloud|aol)\./;

function cancelPending(contactId) {
  db.prepare("UPDATE messages SET status='cancelled' WHERE contact_id=? AND status IN ('draft','approved')").run(contactId);
}

async function pollInbox() {
  const last = kvGet('last_poll', null);
  if (!argv.includes('--force-poll') && last && Date.now() - last < 30 * 60 * 1000) return;
  const since = new Date(Math.min(Date.now() - 2 * 864e5, last ? last - 864e5 : Infinity));
  const watching = db.prepare("SELECT id, email, domain, status FROM contacts WHERE status IN ('contacted','queued')").all();
  const byEmail = new Map(watching.map((c) => [c.email, c]));
  const byDomain = new Map();
  for (const c of watching) if (!PERSONAL.test(c.domain)) byDomain.set(c.domain, [...(byDomain.get(c.domain) || []), c]);
  let replied = 0; let bounced = 0; let optedOut = 0;

  await scanInbox(since, async ({ from, subject, text }) => {
    const isBounce = /mailer-daemon|postmaster/i.test(from) || /undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice/i.test(subject);
    if (isBounce) {
      for (const e of new Set((text.match(EMAIL_RE) || []).map((x) => x.toLowerCase()))) {
        const c = byEmail.get(e);
        if (c && c.status === 'contacted') {
          db.prepare("UPDATE contacts SET status='bounced', updated_at=? WHERE id=?").run(nowLocal(), c.id);
          cancelPending(c.id); c.status = 'bounced'; bounced++;
        }
      }
      return;
    }
    let c = byEmail.get(from);
    if (!c) {
      const sameDomain = byDomain.get(from.split('@')[1]) || [];
      if (sameDomain.length === 1) c = sameDomain[0];
    }
    if (!c || c.status !== 'contacted') return;
    const head = text.split(/\r?\n\r?\n/).slice(1).join('\n').slice(0, 1500).toLowerCase();
    const isStop = /^\s*(stop|unsubscribe|remove me)\b/m.test(head) || /not interested|please (remove|unsubscribe)/.test(head);
    db.prepare('UPDATE contacts SET status=?, notes=COALESCE(notes,\'\')||?, updated_at=? WHERE id=?')
      .run(isStop ? 'opted_out' : 'replied', `\n[${nowLocal()}] reply from ${from}: ${subject}`, nowLocal(), c.id);
    cancelPending(c.id);
    c.status = isStop ? 'opted_out' : 'replied';
    if (isStop) optedOut++; else replied++;
  });

  kvSet('last_poll', Date.now());
  if (replied) macNotify('Recruiter replied!', `${replied} new repl${replied > 1 ? 'ies' : 'y'}. Check the Outreach page.`);
  if (replied || bounced || optedOut) console.log(`poll: ${replied} replied, ${bounced} bounced, ${optedOut} opted out`);

  // Auto-throttle: if bounces climb above the threshold, pause sending new first emails.
  const b = bounceStats();
  if (b.sent >= 20 && b.rate > config.maxBounceRate * 2) {
    kvSet('sender_paused', `Paused automatically: bounce rate ${(b.rate * 100).toFixed(1)}% is too high. Review contacts before resuming.`);
  }
}

async function sendOne() {
  const paused = kvGet('sender_paused', null);
  if (paused || !inWindow) return;
  const next = kvGet('next_send_at', 0);
  if (Date.now() < next) return;
  const today = todayLocal();
  const sentToday = db.prepare("SELECT COUNT(*) n FROM messages WHERE status='sent' AND substr(sent_at,1,10)=?").get(today).n;
  if (sentToday >= config.totalCapPerDay) return;

  const m = db.prepare(`SELECT m.*, c.email, c.status AS cstatus FROM messages m JOIN contacts c ON c.id = m.contact_id
    WHERE m.status='approved' AND m.scheduled_at IS NOT NULL AND m.scheduled_at <= ? ORDER BY m.step DESC, m.scheduled_at, m.id LIMIT 1`).get(nowLocal());
  if (!m) return;
  if (m.step > 0 && m.cstatus !== 'contacted') { cancelPending(m.contact_id); return; }
  if (m.step === 0 && !['queued', 'new'].includes(m.cstatus)) { cancelPending(m.contact_id); return; }

  const prev = m.step > 0 ? db.prepare("SELECT message_id FROM messages WHERE contact_id=? AND step=0").get(m.contact_id) : null;
  try {
    const messageId = await sendMail({
      to: m.email, subject: m.subject, text: `${m.body}${OPT_OUT}`,
      inReplyTo: prev?.message_id, attachResume: m.step === 0,
    });
    const sentAt = nowLocal();
    db.transaction(() => {
      db.prepare("UPDATE messages SET status='sent', sent_at=?, message_id=?, error=NULL WHERE id=?").run(sentAt, messageId, m.id);
      db.prepare("UPDATE contacts SET status='contacted', updated_at=? WHERE id=?").run(sentAt, m.contact_id);
      const gapDays = m.step === 0 ? 4 : 6; // follow-ups at +4 and +10 days
      db.prepare("UPDATE messages SET scheduled_at=? WHERE contact_id=? AND step=? AND status='approved'")
        .run(addDaysLocal(sentAt, gapDays), m.contact_id, m.step + 1);
    })();
    const gapMin = config.minGapMin + Math.random() * (config.maxGapMin - config.minGapMin);
    kvSet('next_send_at', Date.now() + gapMin * 60 * 1000);
    console.log(`sent step ${m.step} to ${m.email}`);
  } catch (e) {
    db.prepare("UPDATE messages SET status='failed', error=? WHERE id=?").run(String(e.message).slice(0, 500), m.id);
    if (/auth|Invalid login|535|534/i.test(e.message)) {
      kvSet('sender_paused', `Paused: Gmail rejected the login (${e.message.slice(0, 120)}). Fix GMAIL_APP_PASSWORD then resume.`);
      macNotify('Outreach paused', 'Gmail login failed. Check your App Password.');
    }
    console.error(`send failed: ${e.message}`);
  }
}

async function dailySummary() {
  const today = todayLocal();
  if (!weekday || hour < config.sendWindow[1] || kvGet('summary_date') === today) return;
  kvSet('summary_date', today);
  const sent = db.prepare("SELECT c.email, c.company, m.step FROM messages m JOIN contacts c ON c.id=m.contact_id WHERE m.status='sent' AND substr(m.sent_at,1,10)=?").all(today);
  const replies = db.prepare("SELECT email, company, status FROM contacts WHERE status IN ('replied','opted_out','bounced') AND substr(updated_at,1,10)=?").all(today);
  if (!sent.length && !replies.length) return;
  const lines = [
    `Sent today: ${sent.length}`,
    ...sent.map((s) => `  - ${s.email} (${s.company || '-'}) ${s.step ? `follow-up ${s.step}` : 'first email'}`),
    '', `Replies / bounces today: ${replies.length}`,
    ...replies.map((r) => `  - ${r.status.toUpperCase()}: ${r.email} (${r.company || '-'})`),
    '', `${config.baseUrl}/outreach`,
  ];
  await sendToSelf(`[LinkedIn Studio] Outreach summary ${today}: ${sent.length} sent, ${replies.filter((r) => r.status === 'replied').length} replies`, lines.join('\n'));
}

if (!smtpReady()) process.exit(0);
try {
  await pollInbox();
  if (!argv.includes('--poll-only')) await sendOne();
  await dailySummary();
} catch (e) {
  console.error(e.message);
}
process.exit(0);
