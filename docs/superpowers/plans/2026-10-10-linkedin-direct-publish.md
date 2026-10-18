# Direct LinkedIn Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An approved draft can be published to the user's LinkedIn profile (text + PDF/video/image + first comment) with one deliberate "Post to LinkedIn" click, via LinkedIn's official API.

**Architecture:** Pure formatting helpers (`lib/linkedin-format.mjs`) + an HTTP client bound to a stored OAuth token (`lib/linkedin.mjs`) + a resumable orchestration function with injected deps (`lib/publish.mjs`). The web app spawns `scripts/publish.mjs` as a background job (same pattern as `generate.mjs`); OAuth is three small Next.js route handlers; the token lives in the existing `kv` table.

**Tech Stack:** Next.js 15 app router, better-sqlite3, Node 22 built-in `fetch` and `node:test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-linkedin-direct-publish-design.md`

## Global Constraints

- LinkedIn REST headers on every `/rest/*` call: `Linkedin-Version: <config.liApiVersion>` (default `202609`), `X-Restli-Protocol-Version: 2.0.0`.
- OAuth scopes exactly: `openid profile w_member_social`. Redirect: `${config.baseUrl}/api/linkedin/callback`.
- Token stored in `kv` key `linkedin_auth` = `{ token, expiresAt, personUrn, name }`; never logged, never written to files.
- Nothing posts unless the draft status is `approved` AND the user clicked Post → Confirm. Approve alone never posts.
- `li_post_urn` is saved immediately after `createPost` returns; any retry with `li_post_urn` set must not call `createPost`.
- No `window.confirm`/`alert` in UI (in-page confirm only).
- Repo is not under git: there are no commit steps.
- Run unit tests with `node --test test/` from `~/linkedin-studio`.

## Review Focus

1. Post text containing `( ) [ ] _ * #` and URLs → appears on LinkedIn verbatim, not truncated (Task 1 tests + Task 6 smoke).
2. Comment fails after post succeeded → draft shows "posted, comment failed", retry posts only the comment (Task 3 test).
3. Token expired between connect and publish → clear "reconnect in Settings" error, draft back to `approved` (Task 2 test for `getAuth` expiry + Task 4 route guard).
4. Publish script killed mid-run leaves draft in `publishing` → after 15 min the Post button reappears (Task 4 route test logic `canPublish`).
5. Double click on Confirm → only one job (route requires `approved`, first click flips to `publishing`; Task 4 `canPublish` test).

---

### Task 1: Formatting helpers (`escapeLittle`, `pickMedia`, `postUrl`)

**Files:**
- Create: `lib/linkedin-format.mjs`
- Test: `test/linkedin-format.test.mjs`

**Interfaces:**
- Produces: `escapeLittle(text: string): string`, `pickMedia(draft): { type: 'document'|'video'|'image'|'none', file?: string, title?: string }`, `postUrl(urn: string): string`, `canPublish(draft, now = Date.now()): boolean`. No Node-only imports (used by a client component).

- [ ] **Step 1: Write the failing tests** — `test/linkedin-format.test.mjs`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canPublish, escapeLittle, pickMedia, postUrl } from '../lib/linkedin-format.mjs';

test('escapes every reserved little-text character', () => {
  assert.equal(escapeLittle('a (b) [c] {d} <e> @f |g ~h *i _j \\k'),
    'a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\@f \\|g \\~h \\*i \\_j \\\\k');
});
test('turns standalone hashtags into hashtag templates', () => {
  assert.equal(escapeLittle('#SystemDesign rocks'), '{hashtag|\\#|SystemDesign} rocks');
  assert.equal(escapeLittle('end\n#AI #LLD'), 'end\n{hashtag|\\#|AI} {hashtag|\\#|LLD}');
});
test('escapes # that is not a hashtag', () => {
  assert.equal(escapeLittle('C# and #1'), 'C\\# and {hashtag|\\#|1}');
});
test('keeps newlines, emoji and URLs readable', () => {
  assert.equal(escapeLittle('Line 1\n\n→ 2 ✅\nhttps://x.com/a_b'), 'Line 1\n\n→ 2 ✅\nhttps://x.com/a\\_b');
});
test('pickMedia prefers pdf, then mp4, then png', () => {
  const d = (m) => ({ title: 'T', media_json: JSON.stringify(m) });
  assert.deepEqual(pickMedia(d([{ kind: 'pdf', file: 'carousel.pdf' }, { kind: 'slide', file: 's1.png' }])), { type: 'document', file: 'carousel.pdf', title: 'T' });
  assert.deepEqual(pickMedia(d([{ kind: 'mp4', file: 'explainer.mp4' }, { kind: 'gif', file: 'x.gif' }])), { type: 'video', file: 'explainer.mp4' });
  assert.deepEqual(pickMedia(d([{ kind: 'png', file: 'diagram.png' }])), { type: 'image', file: 'diagram.png' });
  assert.deepEqual(pickMedia({ media_json: null }), { type: 'none' });
});
test('postUrl', () => {
  assert.equal(postUrl('urn:li:share:123'), 'https://www.linkedin.com/feed/update/urn:li:share:123/');
});
test('canPublish: approved yes, fresh publishing no, stale publishing yes', () => {
  const now = Date.parse('2026-10-10T12:00:00');
  assert.equal(canPublish({ status: 'approved' }, now), true);
  assert.equal(canPublish({ status: 'pending' }, now), false);
  assert.equal(canPublish({ status: 'publishing', updated_at: '2026-10-10 11:55:00' }, now), false);
  assert.equal(canPublish({ status: 'publishing', updated_at: '2026-10-10 11:40:00' }, now), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/` — Expected: FAIL, `Cannot find module '../lib/linkedin-format.mjs'`.

- [ ] **Step 3: Implement** — `lib/linkedin-format.mjs`

```js
// Pure helpers for LinkedIn publishing. No Node-only imports: the draft editor (client) uses these too.

const esc = (s) => s.replace(/[\\|{}@[\]()<>#*_~]/g, '\\$&');

// Posts API commentary is "little" text: reserved chars must be escaped or LinkedIn truncates the post.
// Standalone #tags become hashtag templates so they stay clickable.
export function escapeLittle(text = '') {
  return text
    .split(/((?<=^|\s)#[\p{L}\p{N}_]+)/u)
    .map((seg, i) => (i % 2 ? `{hashtag|\\#|${esc(seg.slice(1))}}` : esc(seg)))
    .join('');
}

export function pickMedia(d) {
  const media = JSON.parse(d.media_json || '[]');
  const pdf = media.find((m) => m.kind === 'pdf');
  if (pdf) return { type: 'document', file: pdf.file, title: d.title };
  const mp4 = media.find((m) => m.kind === 'mp4');
  if (mp4) return { type: 'video', file: mp4.file };
  const png = media.find((m) => m.kind === 'png');
  if (png) return { type: 'image', file: png.file };
  return { type: 'none' };
}

export const postUrl = (urn) => `https://www.linkedin.com/feed/update/${urn}/`;

const STALE_MS = 15 * 60 * 1000;
// A crashed publish job leaves the draft in 'publishing'; after 15 min it can be retried.
// Retrying is safe because publishDraft skips createPost once li_post_urn is saved.
export function canPublish(d, now = Date.now()) {
  if (d.status === 'approved') return true;
  if (d.status !== 'publishing') return false;
  return now - Date.parse(String(d.updated_at).replace(' ', 'T')) > STALE_MS;
}
```

- [ ] **Step 4: Run tests** — `node --test test/` — Expected: all PASS.

---

### Task 2: Config, DB migration, LinkedIn client + token store

**Files:**
- Modify: `lib/config.mjs` (add 3 keys to `config`)
- Modify: `lib/db.mjs` (`getDb()` migration, status comment)
- Create: `lib/linkedin.mjs`
- Test: `test/linkedin-auth.test.mjs`

**Interfaces:**
- Consumes: `kvGet`, `kvSet` from `lib/db.mjs`; `config` from `lib/config.mjs`.
- Produces:
  - `config.liClientId`, `config.liClientSecret`, `config.liApiVersion`
  - `linkedinConfigured(): boolean`
  - `authUrl(state): string`, `exchangeCode(code): Promise<{access_token, expires_in}>`, `me(token): Promise<{sub, name}>`
  - `getAuth(): {token, expiresAt, personUrn, name} | null` (null if missing or expired), `saveAuth(a)`, `clearAuth()`
  - `authStatus(): { connected: boolean, name?: string, expiresAt?: number, daysLeft?: number }`
  - `createClient(auth)` → `{ uploadImage(path), uploadVideo(path), uploadDocument(path), createPost({commentary, media?, visibility?}), createComment(postUrn, text), deletePost(urn) }`, each async; ids are URN strings.
  - `class LinkedInError extends Error { status, body }` — 401 message: `LinkedIn session expired, reconnect in Settings`.
  - drafts columns `li_post_urn TEXT`, `li_comment_done INTEGER NOT NULL DEFAULT 0`.

- [ ] **Step 1: Write failing tests** — `test/linkedin-auth.test.mjs`

```js
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
```

- [ ] **Step 2: Run** — `node --test test/` — Expected: FAIL (`lib/linkedin.mjs` missing).

- [ ] **Step 3: Config + data-dir override** — in `lib/config.mjs` replace the `DATA_DIR` line and extend `config`:

```js
export const DATA_DIR = process.env.STUDIO_DATA_DIR || path.join(ROOT, 'data');
```

Add inside `config` (after `baseUrl`):

```js
  liClientId: process.env.LINKEDIN_CLIENT_ID || '',
  liClientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  liApiVersion: process.env.LINKEDIN_API_VERSION || '202609',
```

- [ ] **Step 4: Migration** — in `lib/db.mjs` change the drafts status comment to `-- generating|pending|approved|publishing|posted|rejected|failed` and in `getDb()` after `db.exec(SCHEMA);` add:

```js
  const cols = db.prepare('PRAGMA table_info(drafts)').all().map((c) => c.name);
  if (!cols.includes('li_post_urn')) db.exec('ALTER TABLE drafts ADD COLUMN li_post_urn TEXT');
  if (!cols.includes('li_comment_done')) db.exec('ALTER TABLE drafts ADD COLUMN li_comment_done INTEGER NOT NULL DEFAULT 0');
```

- [ ] **Step 5: Client** — `lib/linkedin.mjs`

```js
import fs from 'node:fs';
import { config } from './config.mjs';
import { kvGet, kvSet } from './db.mjs';

const API = 'https://api.linkedin.com';
const redirectUri = () => `${config.baseUrl}/api/linkedin/callback`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class LinkedInError extends Error {
  constructor(status, body) {
    super(status === 401 ? 'LinkedIn session expired, reconnect in Settings' : `LinkedIn API ${status}: ${String(body).slice(0, 400)}`);
    this.status = status;
    this.body = body;
  }
}

export const linkedinConfigured = () => Boolean(config.liClientId && config.liClientSecret);

export function authUrl(state) {
  const q = new URLSearchParams({ response_type: 'code', client_id: config.liClientId, redirect_uri: redirectUri(), state, scope: 'openid profile w_member_social' });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

export async function exchangeCode(code) {
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: config.liClientId, client_secret: config.liClientSecret }),
  });
  if (!r.ok) throw new LinkedInError(r.status, await r.text());
  return r.json();
}

export async function me(token) {
  const r = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new LinkedInError(r.status, await r.text());
  return r.json();
}

// Token store (kv table). Self-serve apps get 60-day tokens and no refresh token.
export function getAuth() {
  const a = kvGet('linkedin_auth');
  return a && a.expiresAt > Date.now() ? a : null;
}
export const saveAuth = (a) => kvSet('linkedin_auth', a);
export const clearAuth = () => kvSet('linkedin_auth', null);
export function authStatus() {
  const a = getAuth();
  if (!a) return { connected: false };
  return { connected: true, name: a.name, expiresAt: a.expiresAt, daysLeft: Math.ceil((a.expiresAt - Date.now()) / 86400000) };
}

export function createClient(auth) {
  const owner = auth.personUrn;
  const headers = { Authorization: `Bearer ${auth.token}`, 'Linkedin-Version': config.liApiVersion, 'X-Restli-Protocol-Version': '2.0.0' };

  async function api(method, path, body) {
    const r = await fetch(`${API}/rest/${path}`, {
      method,
      headers: body ? { ...headers, 'content-type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new LinkedInError(r.status, await r.text());
    return r;
  }
  const json = async (r) => { const t = await r.text(); return t ? JSON.parse(t) : {}; };

  async function put(url, bytes) {
    const r = await fetch(url, { method: 'PUT', headers: { Authorization: headers.Authorization, 'content-type': 'application/octet-stream' }, body: bytes });
    if (!r.ok) throw new LinkedInError(r.status, await r.text());
    return r;
  }

  // Images, videos and documents process asynchronously; posting before AVAILABLE fails.
  async function waitAvailable(collection, urn, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const { status } = await json(await api('GET', `${collection}/${encodeURIComponent(urn)}`));
      if (status === 'AVAILABLE') return;
      if (status === 'PROCESSING_FAILED') throw new Error(`LinkedIn could not process the ${collection.slice(0, -1)}`);
      await sleep(3000);
    }
    throw new Error(`LinkedIn is still processing the ${collection.slice(0, -1)} after ${timeoutMs / 60000} min`);
  }

  return {
    async uploadImage(file) {
      const { value } = await json(await api('POST', 'images?action=initializeUpload', { initializeUploadRequest: { owner } }));
      await put(value.uploadUrl, fs.readFileSync(file));
      await waitAvailable('images', value.image, 2 * 60000);
      return value.image;
    },
    async uploadDocument(file) {
      const { value } = await json(await api('POST', 'documents?action=initializeUpload', { initializeUploadRequest: { owner } }));
      await put(value.uploadUrl, fs.readFileSync(file));
      await waitAvailable('documents', value.document, 5 * 60000);
      return value.document;
    },
    async uploadVideo(file) {
      const bytes = fs.readFileSync(file);
      const { value } = await json(await api('POST', 'videos?action=initializeUpload', {
        initializeUploadRequest: { owner, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false },
      }));
      const etags = [];
      for (const part of value.uploadInstructions) {
        const r = await put(part.uploadUrl, bytes.subarray(part.firstByte, part.lastByte + 1));
        etags.push(r.headers.get('etag'));
      }
      await api('POST', 'videos?action=finalizeUpload', { finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken || '', uploadedPartIds: etags } });
      await waitAvailable('videos', value.video, 10 * 60000);
      return value.video;
    },
    async createPost({ commentary, media, visibility = 'PUBLIC' }) {
      const r = await api('POST', 'posts', {
        author: owner,
        commentary,
        visibility,
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(media ? { content: { media } } : {}),
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      });
      return r.headers.get('x-restli-id');
    },
    async createComment(postUrn, text) {
      await api('POST', `socialActions/${encodeURIComponent(postUrn)}/comments`, { actor: owner, object: postUrn, message: { text } });
    },
    async deletePost(urn) {
      await api('DELETE', `posts/${encodeURIComponent(urn)}`);
    },
  };
}
```

- [ ] **Step 6: Run** — `node --test test/` — Expected: all PASS. Also confirm the real DB migrates: `node -e "import('./lib/db.mjs').then(m=>console.log(m.getDb().prepare('PRAGMA table_info(drafts)').all().map(c=>c.name).slice(-2)))"` → `[ 'li_post_urn', 'li_comment_done' ]`.

---

### Task 3: Resumable publish orchestration + job script

**Files:**
- Create: `lib/publish.mjs`
- Create: `scripts/publish.mjs`
- Test: `test/publish.test.mjs`

**Interfaces:**
- Consumes: `escapeLittle`, `pickMedia`, `postUrl` (Task 1); `createClient`, `getAuth` (Task 2); `startJob/jobLog/finishJob` (`lib/jobs.mjs`); `appendPostLog` (`lib/drafts.mjs`); `macNotify` (`lib/notify.mjs`).
- Produces: `publishDraft(d, { client, save, log?, filePath }): Promise<{ urn, url }>` where `save(fields)` persists columns and `filePath(name)` resolves a media file. CLI: `node scripts/publish.mjs --draft <id>`; job type `publish`, detail `draft <id>: publish`.

- [ ] **Step 1: Write failing tests** — `test/publish.test.mjs`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishDraft } from '../lib/publish.mjs';

function harness({ failComment = false } = {}) {
  const calls = [];
  const saved = [];
  const client = {
    uploadImage: async (p) => { calls.push(['image', p]); return 'urn:li:image:1'; },
    uploadVideo: async (p) => { calls.push(['video', p]); return 'urn:li:video:1'; },
    uploadDocument: async (p) => { calls.push(['document', p]); return 'urn:li:document:1'; },
    createPost: async (a) => { calls.push(['post', a]); return 'urn:li:share:9'; },
    createComment: async (u, t) => { calls.push(['comment', u, t]); if (failComment) throw new Error('boom'); },
  };
  const deps = { client, save: (f) => { calls.push(['save', f]); saved.push(f); }, filePath: (f) => `/d/${f}` };
  return { calls, saved, deps };
}
const base = { title: 'T', text: 'Hi (there) #AI', first_comment: 'Source: https://x.com', media_json: '[]', li_post_urn: null, li_comment_done: 0 };

test('text post: escapes, posts, saves urn before commenting', async () => {
  const h = harness();
  const r = await publishDraft(base, h.deps);
  assert.deepEqual(h.calls.map((c) => c[0]), ['post', 'save', 'comment', 'save']);
  assert.equal(h.calls[0][1].commentary, 'Hi \\(there\\) {hashtag|\\#|AI}');
  assert.equal(h.calls[0][1].media, undefined);
  assert.deepEqual(h.saved, [{ li_post_urn: 'urn:li:share:9' }, { li_comment_done: 1 }]);
  assert.equal(r.url, 'https://www.linkedin.com/feed/update/urn:li:share:9/');
});
test('carousel uploads the pdf with the draft title', async () => {
  const h = harness();
  await publishDraft({ ...base, media_json: JSON.stringify([{ kind: 'pdf', file: 'carousel.pdf' }]) }, h.deps);
  assert.deepEqual(h.calls[0], ['document', '/d/carousel.pdf']);
  assert.deepEqual(h.calls[1][1].media, { id: 'urn:li:document:1', title: 'T' });
});
test('video and image media', async () => {
  let h = harness();
  await publishDraft({ ...base, media_json: JSON.stringify([{ kind: 'mp4', file: 'explainer.mp4' }]) }, h.deps);
  assert.deepEqual(h.calls[1][1].media, { id: 'urn:li:video:1' });
  h = harness();
  await publishDraft({ ...base, media_json: JSON.stringify([{ kind: 'png', file: 'diagram.png' }]) }, h.deps);
  assert.deepEqual(h.calls[1][1].media, { id: 'urn:li:image:1' });
});
test('comment failure still leaves the urn saved', async () => {
  const h = harness({ failComment: true });
  await assert.rejects(publishDraft(base, h.deps), /boom/);
  assert.deepEqual(h.saved, [{ li_post_urn: 'urn:li:share:9' }]);
});
test('retry with urn set never posts again, only comments', async () => {
  const h = harness();
  await publishDraft({ ...base, li_post_urn: 'urn:li:share:9' }, h.deps);
  assert.deepEqual(h.calls.map((c) => c[0]), ['comment', 'save']);
});
test('no first comment, already-commented: nothing extra', async () => {
  const h = harness();
  await publishDraft({ ...base, first_comment: '' }, h.deps);
  assert.deepEqual(h.calls.map((c) => c[0]), ['post', 'save']);
  const h2 = harness();
  await publishDraft({ ...base, li_post_urn: 'urn:li:share:9', li_comment_done: 1 }, h2.deps);
  assert.deepEqual(h2.calls, []);
});
```

- [ ] **Step 2: Run** — `node --test test/` — Expected: FAIL (`lib/publish.mjs` missing).

- [ ] **Step 3: Implement** — `lib/publish.mjs`

```js
import { escapeLittle, pickMedia, postUrl } from './linkedin-format.mjs';

// Publishes a draft in resumable steps. The post URN is saved the moment LinkedIn returns it,
// so a retry after a failed comment (or a crash) never creates a second post.
export async function publishDraft(d, { client, save, log = () => {}, filePath }) {
  let urn = d.li_post_urn;
  if (!urn) {
    const m = pickMedia(d);
    let media;
    if (m.type !== 'none') {
      log(`uploading ${m.type} ${m.file}`);
      if (m.type === 'document') media = { id: await client.uploadDocument(filePath(m.file)), title: m.title };
      if (m.type === 'video') media = { id: await client.uploadVideo(filePath(m.file)) };
      if (m.type === 'image') media = { id: await client.uploadImage(filePath(m.file)) };
    }
    log('creating post');
    urn = await client.createPost({ commentary: escapeLittle(d.text || ''), media });
    save({ li_post_urn: urn });
    log(`posted ${urn}`);
  }
  if (d.first_comment && !d.li_comment_done) {
    log('posting first comment');
    await client.createComment(urn, d.first_comment);
    save({ li_comment_done: 1 });
  }
  return { urn, url: postUrl(urn) };
}
```

- [ ] **Step 4: Run** — `node --test test/` — Expected: all PASS.

- [ ] **Step 5: Job script** — `scripts/publish.mjs`

```js
// Publish an approved draft to LinkedIn via the official API. Usage: node scripts/publish.mjs --draft 5
import path from 'node:path';
import { getDb, nowLocal } from '../lib/db.mjs';
import { appendPostLog } from '../lib/drafts.mjs';
import { finishJob, jobLog, startJob } from '../lib/jobs.mjs';
import { createClient, getAuth } from '../lib/linkedin.mjs';
import { macNotify } from '../lib/notify.mjs';
import { publishDraft } from '../lib/publish.mjs';

const i = process.argv.indexOf('--draft');
const id = Number(process.argv[i + 1]);
const db = getDb();
const get = () => db.prepare('SELECT * FROM drafts WHERE id = ?').get(id);
const jobId = startJob('publish', `draft ${id}: publish`);
const log = (s) => { console.log(s); jobLog(jobId, s); };

const d = get();
try {
  if (!d) throw new Error(`draft ${id} not found`);
  const auth = getAuth();
  if (!auth) throw new Error('LinkedIn is not connected (or the token expired). Connect it in Settings.');
  const save = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE drafts SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => fields[k]), nowLocal(), id);
  };
  const { url } = await publishDraft(d, { client: createClient(auth), save, log, filePath: (f) => path.join(d.dir, f) });
  db.prepare("UPDATE drafts SET status='posted', posted_url=?, posted_at=?, error=NULL, updated_at=? WHERE id=?").run(url, nowLocal(), nowLocal(), id);
  appendPostLog(get());
  log(`done: ${url}`);
  finishJob(jobId, true);
  macNotify('LinkedIn Studio', `Posted: ${d.title}`);
} catch (e) {
  const posted = get()?.li_post_urn;
  const msg = posted ? `Posted, but the first comment failed: ${e.message}. Retry posts only the comment.` : e.message;
  db.prepare("UPDATE drafts SET status='approved', error=?, updated_at=? WHERE id=?").run(msg, nowLocal(), id);
  log(`failed: ${msg}`);
  finishJob(jobId, false);
  macNotify('LinkedIn Studio', `Publish failed: ${msg.slice(0, 120)}`);
  process.exitCode = 1;
}
```

- [ ] **Step 6: Verify the script's no-auth path** — `node scripts/publish.mjs --draft 999999` → prints `failed: draft 999999 not found`, exit code 1, no LinkedIn calls.

---

### Task 4: Publish action + OAuth routes

**Files:**
- Modify: `app/api/drafts/[id]/route.js` (POST: add `publish`, guard `unapprove`/`reject` once posted)
- Create: `app/api/linkedin/connect/route.js`, `app/api/linkedin/callback/route.js`, `app/api/linkedin/disconnect/route.js`

**Interfaces:**
- Consumes: `canPublish` (Task 1), `getAuth`, `authUrl`, `exchangeCode`, `me`, `saveAuth`, `clearAuth`, `linkedinConfigured` (Task 2), `kvGet/kvSet`, `spawnScript`.
- Produces: `POST /api/drafts/:id {action:'publish'}` → `{draft}` with status `publishing`, or 409 `{error}`. `GET /api/linkedin/connect`, `GET /api/linkedin/callback`, `POST /api/linkedin/disconnect` (all redirect to `/settings?linkedin=connected|error|disconnected&msg=…`).

- [ ] **Step 1: Publish action** — in `app/api/drafts/[id]/route.js` add imports:

```js
import { getAuth } from '@/lib/linkedin.mjs';
import { canPublish } from '@/lib/linkedin-format.mjs';
```

and in `POST`, right after the `if (!d) return …404` line:

```js
  const conflict = (error) => Response.json({ error }, { status: 409 });
  if (d.li_post_urn && ['unapprove', 'reject'].includes(action)) return conflict('Already on LinkedIn. Delete it there first.');
```

and add a branch before `else if (action === 'regenerate')`:

```js
  else if (action === 'publish') {
    if (!canPublish(d)) return conflict(`Only approved drafts can be posted (this one is ${d.status}).`);
    if (!getAuth()) return conflict('Connect LinkedIn in Settings first.');
    db.prepare("UPDATE drafts SET status='publishing', error=NULL, updated_at=? WHERE id=?").run(nowLocal(), id);
    spawnScript('publish.mjs', ['--draft', String(id)]);
  }
```

- [ ] **Step 2: OAuth routes**

`app/api/linkedin/connect/route.js`:

```js
import crypto from 'node:crypto';
import { config } from '@/lib/config.mjs';
import { kvSet } from '@/lib/db.mjs';
import { authUrl, linkedinConfigured } from '@/lib/linkedin.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!linkedinConfigured()) {
    return Response.redirect(`${config.baseUrl}/settings?linkedin=error&msg=${encodeURIComponent('Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env.local and restart')}`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  kvSet('linkedin_oauth_state', { state, at: Date.now() });
  return Response.redirect(authUrl(state));
}
```

`app/api/linkedin/callback/route.js`:

```js
import { config } from '@/lib/config.mjs';
import { kvGet, kvSet } from '@/lib/db.mjs';
import { exchangeCode, me, saveAuth } from '@/lib/linkedin.mjs';

export const dynamic = 'force-dynamic';

const back = (q) => Response.redirect(`${config.baseUrl}/settings?${new URLSearchParams(q)}`);

export async function GET(req) {
  const u = new URL(req.url);
  const saved = kvGet('linkedin_oauth_state');
  kvSet('linkedin_oauth_state', null);
  if (u.searchParams.get('error')) return back({ linkedin: 'error', msg: u.searchParams.get('error_description') || u.searchParams.get('error') });
  if (!saved || saved.state !== u.searchParams.get('state') || Date.now() - saved.at > 10 * 60000) {
    return back({ linkedin: 'error', msg: 'Sign-in link expired. Click Connect again.' });
  }
  try {
    const t = await exchangeCode(u.searchParams.get('code'));
    const p = await me(t.access_token);
    saveAuth({ token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000, personUrn: `urn:li:person:${p.sub}`, name: p.name });
    return back({ linkedin: 'connected' });
  } catch (e) {
    return back({ linkedin: 'error', msg: e.message });
  }
}
```

`app/api/linkedin/disconnect/route.js`:

```js
import { config } from '@/lib/config.mjs';
import { clearAuth } from '@/lib/linkedin.mjs';

export async function POST() {
  clearAuth();
  return Response.redirect(`${config.baseUrl}/settings?linkedin=disconnected`, 303);
}
```

- [ ] **Step 3: Verify routes** — restart web (`launchctl kickstart -k gui/$(id -u)/com.linkedin-studio.web`), then:
  - `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:3000/api/linkedin/connect` → `302` to `/settings?linkedin=error&msg=Add+LINKEDIN_CLIENT_ID…` (no keys yet).
  - `curl -s -w '\n%{http_code}\n' localhost:3000/api/linkedin/callback?state=bad&code=x` → 302 to `…msg=Sign-in+link+expired…`.
  - Pick a `pending` draft id N: `curl -s -X POST localhost:3000/api/drafts/N -H 'content-type: application/json' -d '{"action":"publish"}'` → 409 `Only approved drafts can be posted (this one is pending).`

---

### Task 5: UI — Settings connect, queue banner, Post to LinkedIn

**Files:**
- Modify: `app/settings/page.js`
- Modify: `app/page.js`
- Modify: `app/draft/[id]/page.js`, `app/draft/[id]/editor.js`
- Modify: `app/globals.css` (`.chip.publishing`)

**Interfaces:**
- Consumes: `authStatus`, `linkedinConfigured` (Task 2); `pickMedia`, `canPublish` (Task 1); `/api/drafts/:id {action:'publish'}`, `/api/linkedin/*` (Task 4); `/api/jobs?type=publish`.
- Produces: user-facing flow only.

- [ ] **Step 1: Settings** — `app/settings/page.js`: add import `import { authStatus, linkedinConfigured } from '@/lib/linkedin.mjs';`, make the component `export default async function Settings({ searchParams }) {` with `const sp = await searchParams; const li = authStatus();` at the top, and insert before the existing `<div className="card" style={{ padding: 0 }}>`:

```jsx
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
```

- [ ] **Step 2: Queue page** — `app/page.js`: import `authStatus` from `@/lib/linkedin.mjs`; change the drafts query to `status IN ('pending','approved','publishing','generating','failed')`; change the sub text to `Review it, approve it, then post it to LinkedIn.`; add `const li = authStatus();` and right after the header row:

```jsx
      {(!li.connected || li.daysLeft < 7) && (
        <div className="err" style={{ marginBottom: 16 }}>
          {li.connected ? `LinkedIn sign-in expires in ${li.daysLeft} days.` : 'LinkedIn is not connected.'} <Link href="/settings">Connect in Settings</Link>
        </div>
      )}
```

- [ ] **Step 3: Draft page** — `app/draft/[id]/page.js`: import `authStatus`; make the job query pick the right type: `const type = d.status === 'publishing' ? 'publish' : 'generate';` and `WHERE type=? AND detail LIKE ?` with `.get(type, \`draft ${d.id}:%\`)`; pass `li={authStatus()}` to `DraftEditor`.

- [ ] **Step 4: Editor** — `app/draft/[id]/editor.js`:
  1. `import { canPublish, pickMedia } from '@/lib/linkedin-format.mjs';`
  2. Add component above `DraftEditor`:

```jsx
const MEDIA_LABEL = { document: 'carousel PDF', video: 'video', image: 'image', none: 'no media (text only)' };

function PostToLinkedIn({ d, li, busy, onPublish }) {
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
      {!confirming ? (
        <div className="step"><button className="btn primary" disabled={!!busy} onClick={() => setConfirming(true)}>{retryComment ? 'Retry first comment' : 'Post to LinkedIn'}</button></div>
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
```

  3. `export default function DraftEditor({ initial, job: initialJob, handle, li }) {`
  4. Generalize the polling effect: replace `if (d.status !== 'generating') return;` with `if (!['generating', 'publishing'].includes(d.status)) return;`, the fetch URL with `` `/api/jobs?type=${d.status === 'publishing' ? 'publish' : 'generate'}` ``, and the poll interval stays 4000.
  5. In `act`, after `const r = await …json());` add `if (r.error) { setBusy(''); setD({ ...d, error: r.error }); return; }`.
  6. Add after the `generating` early return:

```jsx
  if (d.status === 'publishing') {
    return (
      <div className="card">
        <h1>Posting to LinkedIn… <span className="chip publishing">publishing</span></h1>
        <p className="sub">{d.title}. Uploading media and creating the post. Videos can take a few minutes.</p>
        <pre className="log">{job?.log || 'starting…'}</pre>
      </div>
    );
  }
```

  7. Replace the approved Publish Kit line with:

```jsx
      {d.status === 'approved' && (
        <div style={{ margin: '16px 0' }} className="grid">
          <PostToLinkedIn d={d} li={li} busy={busy} onPublish={() => act('publish')} />
          {!d.li_post_urn && <details><summary className="small muted">Post manually instead</summary><div style={{ marginTop: 10 }}><PublishKit d={d} text={text} onPosted={(url) => act('posted', { url })} /></div></details>}
        </div>
      )}
```

  8. Hide "Back to edit" once on LinkedIn: `{d.status === 'approved' && !d.li_post_urn && <button … 'unapprove' …>}`.
  9. In `PublishKit`, change the subtitle to `Manual fallback: copy, attach, post yourself.`

- [ ] **Step 5: CSS** — `app/globals.css`: change line `.chip.REVIEW,.chip.generating,.chip.draft{…}` to `.chip.REVIEW,.chip.generating,.chip.publishing,.chip.draft{…}`.

- [ ] **Step 6: Build + click-through** — `npx next build` (Expected: compiles, no type/import errors), restart web, then in the browser:
  - `/settings` shows "Not connected" + Connect; clicking it shows the missing-keys error.
  - `/` shows the "LinkedIn is not connected" banner.
  - Open an approved draft: "Post to LinkedIn" card says not connected; "Post manually instead" expands the old kit.

---

### Task 6: Live connect + smoke test (needs the user)

**Files:**
- Create: `scripts/li-smoke.mjs`
- Modify: `README.md` (setup section), `.env.local` (user pastes keys)

**Interfaces:**
- Consumes: `getAuth`, `createClient`, `escapeLittle`, `postUrl`.

- [ ] **Step 1: Smoke script** — `scripts/li-smoke.mjs`

```js
// Live check of the LinkedIn integration: posts a connections-only test post with reserved characters
// and a comment, prints the URL, waits for you to look, then deletes it. Usage: node scripts/li-smoke.mjs
import readline from 'node:readline/promises';
import { createClient, getAuth } from '../lib/linkedin.mjs';
import { escapeLittle, postUrl } from '../lib/linkedin-format.mjs';

const auth = getAuth();
if (!auth) { console.error('Not connected. Connect LinkedIn in Settings first.'); process.exit(1); }
const li = createClient(auth);
const urn = await li.createPost({ visibility: 'CONNECTIONS', commentary: escapeLittle('Test, please ignore (deleting in a minute). [brackets] snake_case *stars* C# #Testing') });
await li.createComment(urn, 'Source (test): https://example.com/a_b?x=(1)');
console.log(`Posted: ${postUrl(urn)}\nCheck the text and comment look exactly right.`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Press Enter to delete it… ');
rl.close();
await li.deletePost(urn);
console.log('Deleted.');
```

- [ ] **Step 2: the user's setup** (hand over these exact steps): linkedin.com/developers → Create app (associate any LinkedIn Page) → Products: add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** → Auth: add redirect `http://localhost:3000/api/linkedin/callback` → copy Client ID/Secret into `.env.local` as `LINKEDIN_CLIENT_ID=` / `LINKEDIN_CLIENT_SECRET=` → restart web → Settings → Connect LinkedIn.

- [ ] **Step 3: Smoke run, only with the user's explicit OK at that moment** — `node scripts/li-smoke.mjs`. Expected: URL printed; on LinkedIn the post shows `(…)`, `[brackets]`, `snake_case`, `*stars*`, `C#` literally and `#Testing` as a hashtag; the comment shows the URL with no stray backslashes. If the comment shows backslashes or is cut, comment text must be passed through `escapeLittle` in `publishDraft` — update Task 3 test "text post" accordingly and rerun.

- [ ] **Step 4: README** — add a "Direct posting to LinkedIn" section with the Step 2 setup list and "Token lasts 60 days; Reconnect from Settings when the banner appears."

- [ ] **Step 5: Final verification** — `node --test test/` all PASS; `npx next build` succeeds; web restarted; Settings shows "Connected as …".
