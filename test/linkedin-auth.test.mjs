import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Isolate the DB: lib/config.mjs derives DATA_DIR from ROOT, so point a throwaway copy at a temp dir.
process.env.STUDIO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'li-test-'));
const { getDb } = await import('../lib/db.mjs');
const li = await import('../lib/linkedin.mjs');

test('drafts table has the publish columns', () => {
  const cols = getDb().prepare('PRAGMA table_info(drafts)').all().map((c) => c.name);
  assert.ok(cols.includes('li_post_urn'));
  assert.ok(cols.includes('li_comment_done'));
});
test('getAuth returns null when expired and authStatus reports days left', () => {
  li.saveAuth({ token: 't', expiresAt: Date.now() - 1000, personUrn: 'urn:li:person:x', name: 'A' });
  assert.equal(li.getAuth(), null);
  assert.equal(li.authStatus().connected, false);
  li.saveAuth({ token: 't', expiresAt: Date.now() + 10 * 86400000, personUrn: 'urn:li:person:x', name: 'A' });
  assert.equal(li.getAuth().token, 't');
  assert.equal(li.authStatus().daysLeft, 10);
  li.clearAuth();
  assert.equal(li.getAuth(), null);
});
test('authUrl carries scopes, state and redirect', () => {
  const u = new URL(li.authUrl('abc'));
  assert.equal(u.searchParams.get('scope'), 'openid profile w_member_social');
  assert.equal(u.searchParams.get('state'), 'abc');
  assert.match(u.searchParams.get('redirect_uri'), /\/api\/linkedin\/callback$/);
});
test('401 becomes a reconnect message', () => {
  assert.equal(new li.LinkedInError(401, 'x').message, 'LinkedIn session expired, reconnect in Settings');
});
