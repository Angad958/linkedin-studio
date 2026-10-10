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
      const urn = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id');
      // Without the id a retry can't tell the post exists and would publish it twice.
      if (!urn) throw new Error('LinkedIn accepted the post but returned no post id. Check your profile before retrying.');
      return urn;
    },
    async createComment(postUrn, text) {
      await api('POST', `socialActions/${encodeURIComponent(postUrn)}/comments`, { actor: owner, object: postUrn, message: { text } });
    },
    async deletePost(urn) {
      await api('DELETE', `posts/${encodeURIComponent(urn)}`);
    },
  };
}
