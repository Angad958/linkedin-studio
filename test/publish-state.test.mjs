import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.STUDIO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'li-state-'));
const { getDb } = await import('../lib/db.mjs');
const { finishJob, startJob } = await import('../lib/jobs.mjs');
const { activePublishJob, markPostedFromUrn } = await import('../lib/publish-state.mjs');
const { createClient } = await import('../lib/linkedin.mjs');

test('activePublishJob: matches only this draft, only while running and recent', () => {
  const j = startJob('publish', 'draft 5: publish');
  startJob('generate', 'draft 5: all');
  assert.equal(activePublishJob(5)?.id, j);
  assert.equal(activePublishJob(51), undefined);
  assert.equal(activePublishJob(50), undefined);
  getDb().prepare("UPDATE jobs SET started_at = datetime('now','localtime','-50 minutes') WHERE id = ?").run(j);
  assert.equal(activePublishJob(5), undefined);
  const j2 = startJob('publish', 'draft 5: publish');
  finishJob(j2, false);
  assert.equal(activePublishJob(5), undefined);
});

test('markPostedFromUrn finishes a post whose comment keeps failing', () => {
  const db = getDb();
  const id = Number(db.prepare("INSERT INTO drafts(for_date, dir, status, li_post_urn, error) VALUES('2026-10-10','/tmp','approved','urn:li:share:9','comment failed')").run().lastInsertRowid);
  const d = markPostedFromUrn(id);
  assert.equal(d.status, 'posted');
  assert.equal(d.posted_url, 'https://www.linkedin.com/feed/update/urn:li:share:9/');
  assert.equal(d.error, null);
  const plain = Number(db.prepare("INSERT INTO drafts(for_date, dir, status) VALUES('2026-10-10','/tmp','approved')").run().lastInsertRowid);
  assert.equal(markPostedFromUrn(plain), null);
});

test('createPost throws when LinkedIn returns no post id', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 201 });
  try {
    const c = createClient({ token: 't', personUrn: 'urn:li:person:x' });
    await assert.rejects(c.createPost({ commentary: 'x' }), /no post id/);
  } finally { globalThis.fetch = real; }
});
