import { getDb, nowLocal } from './db.mjs';
import { postUrl } from './linkedin-format.mjs';

// A publish job counts as live for 45 min (covers a slow video upload + 10 min processing).
// A killed job stays 'running' in the jobs table, so the age cap is what eventually frees the draft.
export function activePublishJob(draftId) {
  return getDb().prepare("SELECT * FROM jobs WHERE type = 'publish' AND status = 'running' AND detail LIKE ? AND started_at > datetime('now','localtime','-45 minutes') ORDER BY id DESC LIMIT 1")
    .get(`draft ${draftId}:%`);
}

// The post is live but the first comment keeps failing: finish without it. Returns null if nothing was posted.
export function markPostedFromUrn(id) {
  const db = getDb();
  const d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  if (!d?.li_post_urn) return null;
  db.prepare("UPDATE drafts SET status='posted', posted_url=?, posted_at=?, error=NULL, updated_at=? WHERE id=?")
    .run(postUrl(d.li_post_urn), nowLocal(), nowLocal(), id);
  return db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
}
