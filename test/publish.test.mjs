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
  const deps = { client, save: (f) => { calls.push(['save', f]); saved.push(f); }, filePath: (f) => `/d/${f}`, frame: {} };
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
