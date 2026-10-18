import { config } from './config.mjs';
import { getDb, kvGet, nowLocal, todayLocal } from './db.mjs';

export const OPT_OUT = "\n\n--\nIf this isn't relevant, just reply \"stop\" and I won't follow up.";

// "2+" from CAREER_START (YYYY-MM), so messages stay accurate as time passes.
export function yearsOfExperience() {
  if (!/^\d{4}-\d{2}$/.test(config.careerStart)) return 'several';
  const [y, m] = config.careerStart.split('-').map(Number);
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return `${Math.floor(months / 12)}${months % 12 ? '+' : ''}`;
}

// LinkedIn: normalise a profile URL to https://www.linkedin.com/in/<slug>, or null if it isn't one.
export function normaliseProfileUrl(url = '') {
  const m = String(url).trim().match(/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]+)\/?(?:[?#].*)?$/i);
  return m ? `https://www.linkedin.com/in/${m[1].toLowerCase()}` : null;
}

export const LI_INVITES_PER_DAY = 20;

export function bounceStats() {
  const db = getDb();
  const sent = db.prepare("SELECT COUNT(DISTINCT contact_id) n FROM messages WHERE step = 0 AND status = 'sent'").get().n;
  const bounced = db.prepare("SELECT COUNT(*) n FROM contacts WHERE status = 'bounced'").get().n;
  return { sent, bounced, rate: sent ? bounced / sent : 0 };
}

// Next contacts to email: tier A first, then B once the bounce rate is healthy. One per company domain.
export function pickContacts(n) {
  const db = getDb();
  const { rate, sent } = bounceStats();
  const tiers = rate > config.maxBounceRate && sent >= 20 ? ['A'] : ['A', 'B'];
  const out = [];
  const usedDomains = new Set();
  for (const tier of tiers) {
    const rows = db.prepare(`SELECT * FROM contacts c WHERE tier = ? AND status = 'new'
        AND (kind = 'personal' OR NOT EXISTS (SELECT 1 FROM contacts o WHERE o.domain = c.domain AND o.status NOT IN ('new','skipped')))
      ORDER BY score DESC, CASE kind WHEN 'named' THEN 0 WHEN 'generic' THEN 1 ELSE 2 END, id LIMIT ?`).all(tier, n * 4);
    for (const r of rows) {
      if (out.length >= n) break;
      if (r.kind !== 'personal' && usedDomains.has(r.domain)) continue;
      usedDomains.add(r.domain);
      out.push(r);
    }
    if (out.length >= n) break;
  }
  return { contacts: out, tiers, rate };
}

export function outreachStats() {
  const db = getDb();
  const tiers = Object.fromEntries(db.prepare("SELECT tier, COUNT(*) n FROM contacts GROUP BY tier").all().map((r) => [r.tier, r.n]));
  const statuses = Object.fromEntries(db.prepare("SELECT status, COUNT(*) n FROM contacts GROUP BY status").all().map((r) => [r.status, r.n]));
  const today = todayLocal();
  const sentToday = db.prepare("SELECT COUNT(*) n FROM messages WHERE status='sent' AND substr(sent_at,1,10)=?").get(today).n;
  const queued = db.prepare("SELECT COUNT(*) n FROM messages WHERE status='approved' AND scheduled_at IS NOT NULL").get().n;
  const pendingApproval = db.prepare("SELECT COUNT(DISTINCT contact_id) n FROM messages WHERE status='draft'").get().n;
  return { tiers, statuses, sentToday, queued, pendingApproval, bounce: bounceStats(), paused: kvGet('sender_paused', null), now: nowLocal() };
}
