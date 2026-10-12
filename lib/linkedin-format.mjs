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

// Wraps the post body with the fixed header line and hashtag footer from .env.local (POST_HEADER, POST_HASHTAGS).
// Topical tags on the body's trailing hashtag line are merged into the footer (deduped, case-insensitive).
export function framePost(text = '', { header = '', hashtags = '' } = {}) {
  let body = text.trim();
  if (hashtags) {
    const tail = body.match(/(\n\s*(#[\p{L}\p{N}_]+\s*)+)+$/u);
    const tags = [...hashtags.split(/\s+/), ...(tail ? tail[0].trim().split(/\s+/) : [])].filter(Boolean);
    const seen = new Set();
    hashtags = tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).join(' ');
    if (tail) body = body.slice(0, tail.index).trimEnd();
  }
  return [header, body, hashtags].filter(Boolean).join('\n\n');
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

// jobActive = a publish job for this draft is still running (see activePublishJob).
// A crashed job leaves the draft in 'publishing'; once its job is no longer live it can be retried,
// which is safe because publishDraft skips createPost once li_post_urn is saved.
export function canPublish(d, jobActive = false) {
  if (jobActive) return false;
  return d.status === 'approved' || d.status === 'publishing';
}
