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
