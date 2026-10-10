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
test('canPublish depends on a live publish job, not on time', () => {
  assert.equal(canPublish({ status: 'approved' }, false), true);
  assert.equal(canPublish({ status: 'approved' }, true), false);
  assert.equal(canPublish({ status: 'pending' }, false), false);
  assert.equal(canPublish({ status: 'publishing' }, true), false);
  assert.equal(canPublish({ status: 'publishing' }, false), true);
});
