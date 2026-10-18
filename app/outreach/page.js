import { smtpReady } from '@/lib/config.mjs';
import { getDb } from '@/lib/db.mjs';
import { outreachStats } from '@/lib/outreach.mjs';
import OutreachClient from './client';

export const dynamic = 'force-dynamic';

export default function Outreach() {
  const db = getDb();
  const drafts = db.prepare(`SELECT m.*, c.email, c.name, c.company, c.kind, c.tier FROM messages m JOIN contacts c ON c.id = m.contact_id
    WHERE m.status = 'draft' ORDER BY c.score DESC, m.contact_id, m.step`).all();
  const scheduled = db.prepare(`SELECT m.id, m.step, m.subject, m.scheduled_at, c.email, c.company FROM messages m JOIN contacts c ON c.id = m.contact_id
    WHERE m.status = 'approved' AND m.scheduled_at IS NOT NULL ORDER BY m.scheduled_at LIMIT 100`).all();
  const pipeline = db.prepare(`SELECT c.*, (SELECT MAX(sent_at) FROM messages WHERE contact_id = c.id AND status='sent') last_sent,
      (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND status='sent') n_sent
    FROM contacts c WHERE c.status IN ('contacted','replied','interview','closed','opted_out','bounced') ORDER BY c.updated_at DESC LIMIT 300`).all();
  const failed = db.prepare(`SELECT m.id, m.error, c.email FROM messages m JOIN contacts c ON c.id=m.contact_id WHERE m.status='failed' ORDER BY m.id DESC LIMIT 10`).all();
  const job = db.prepare("SELECT * FROM jobs WHERE type IN ('outreach','import-contacts') ORDER BY id DESC LIMIT 1").get();
  const liContacts = db.prepare(`SELECT * FROM li_contacts WHERE status != 'skipped' ORDER BY tier, created_at DESC, id`).all();
  const liJob = db.prepare("SELECT * FROM jobs WHERE type = 'li-recruiters' ORDER BY id DESC LIMIT 1").get();
  return <OutreachClient stats={outreachStats()} drafts={drafts} scheduled={scheduled} pipeline={pipeline} failed={failed} job={job || null} smtp={smtpReady()}
    liContacts={liContacts} liJob={liJob || null} />;
}
