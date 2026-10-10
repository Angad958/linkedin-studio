# Direct LinkedIn publishing — design

Date: 2026-10-10 · Status: draft for review

## Goal

Approved drafts can be published to Angad's personal LinkedIn profile from LinkedIn Studio with one
deliberate click, via LinkedIn's official API (Share on LinkedIn, `w_member_social`). Nothing is ever
posted without explicit approval. The manual Publish Kit remains as a fallback.

## Decisions (agreed)

- Flow: **Approve → separate "Post to LinkedIn" button** (with a confirm). Approve alone never posts.
- No scheduling, no auto-post on approve.
- First comment (source link) is posted automatically right after the post.
- Manual Publish Kit stays, collapsed under "Post manually instead".

## Facts the design relies on (verified against LinkedIn docs, 2026-10-10)

- REST endpoints need headers `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`.
  Version 202510 sunsets 2026-10-15; we pin **202609** via `LINKEDIN_API_VERSION` (env, default 202609).
- Documents API accepts `urn:li:person` owners with `w_member_social` (PDF ≤ 100 MB, ≤ 300 pages).
- Posts commentary uses the *little* text format: reserved chars `| { } @ [ ] ( ) < > # \ * _ ~` must be
  backslash-escaped or the post is mangled/truncated. Hashtags: `{hashtag|\#|tag}`.
- Self-serve apps get 60-day access tokens and **no refresh token** → re-connect every ~60 days.
- Member rate limit: 150 requests/day.
- Create post returns `201` with the post URN in the `x-restli-id` header.

## Components

### 1. `lib/linkedin.mjs` — API client (pure functions + fetch)

- `authUrl(state)`: authorization URL, scopes `openid profile w_member_social`,
  redirect `http://localhost:3000/api/linkedin/callback`.
- `exchangeCode(code)`: POST `https://www.linkedin.com/oauth/v2/accessToken` → `{ access_token, expires_in }`.
- `me(token)`: GET `/v2/userinfo` → `{ sub, name }`; person URN = `urn:li:person:{sub}`.
- `getAuth()` / `saveAuth()` / `clearAuth()`: stored in `kv` key `linkedin_auth`
  = `{ token, expiresAt, personUrn, name }`. `getAuth()` returns null if expired.
- `escapeLittle(text)`: escapes reserved chars; converts `#word` hashtags to `{hashtag|\#|word}`.
- `uploadImage(path)`: `/rest/images?action=initializeUpload` → PUT bytes → image URN.
- `uploadVideo(path)`: `/rest/videos?action=initializeUpload` (fileSizeBytes) → PUT each part from
  `uploadInstructions`, collect ETags → `finalizeUpload` → poll GET until `AVAILABLE` (timeout 10 min).
- `uploadDocument(path)`: `/rest/documents?action=initializeUpload` → PUT → poll until `AVAILABLE`.
- `createPost({ commentary, media })`: POST `/rest/posts`, visibility from arg (default PUBLIC),
  `lifecycleState: PUBLISHED` → post URN.
- `createComment(postUrn, text)`: POST `/rest/socialActions/{urn}/comments` with `actor` = person URN.
- `deletePost(urn)`: used only by the live smoke test.
- All errors throw `LinkedInError { status, body }`; 401 → message "LinkedIn session expired, reconnect in Settings".

### 2. Media selection — `pickMedia(draft)` (pure, in `lib/linkedin.mjs`)

From `media_json`:
- carousel with a `pdf` → document (title = draft title).
- `mp4` → video.
- `png` (non-slide preview) → single image.
- nothing → text-only.

### 3. OAuth routes

- `app/api/linkedin/connect/route.js`: generates random `state` (stored in kv, 10-min TTL), redirects to `authUrl`.
- `app/api/linkedin/callback/route.js`: checks `state`, exchanges code, calls `me`, saves auth, redirects to `/settings?linkedin=connected`
  (or `?linkedin=error&msg=…`).
- `app/api/linkedin/disconnect/route.js` (POST): clears auth.

### 4. Publishing

- `drafts` table: new nullable column `li_post_urn TEXT` and `li_comment_done INTEGER`, added by an
  idempotent migration in `getDb()` (checks `PRAGMA table_info`). New status value `publishing`.
- `POST /api/drafts/[id]` gains `action: 'publish'`: allowed only when status is `approved`
  and LinkedIn is connected; sets status `publishing`, spawns `scripts/publish.mjs --draft {id}`.
- `scripts/publish.mjs` (runs as a `publish` job, logs to the jobs table):
  1. If `li_post_urn` is empty: upload media, create post, **immediately save `li_post_urn`**.
  2. If `first_comment` and not `li_comment_done`: post comment, set `li_comment_done=1`.
  3. Set status `posted`, `posted_url = https://www.linkedin.com/feed/update/{urn}/`, `posted_at`, call `appendPostLog`.
  - On error: status back to `approved`, `error` = message. Retrying resumes at the first incomplete step,
    so a retry never creates a second post.
- One guard: refuse to publish if a `publish` job is already running for that draft.

### 5. UI

- **Settings**: "LinkedIn" row — Connected as {name}, expires {date} (N days) + Reconnect/Disconnect,
  or a Connect button. Shows setup hint if client id/secret are missing.
- **Queue page**: banner when not connected or < 7 days to expiry.
- **Draft editor** (status `approved`): primary **Post to LinkedIn** button → confirm dialog
  (in-page, not `window.confirm`) showing the media type and "This will be public". While `publishing`,
  show the job log (same polling pattern as generating). Publish Kit moves into a collapsed
  `<details>` "Post manually instead".
- `posted` view unchanged (already shows the URL).

### 6. Config

`.env.local` adds: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, optional `LINKEDIN_API_VERSION`.
Exposed through `lib/config.mjs` like the existing keys.

## Error handling

- Expired/revoked token (401) → draft returns to `approved` with "reconnect" error; Settings shows disconnected.
- Media processing timeout / `PROCESSING_FAILED` → error, no post created.
- Post created but comment fails → draft stays `approved` with `li_post_urn` set and error
  "Posted, but first comment failed — Retry"; retry only does the comment.

## Testing

- Unit (`node --test`, new `test/linkedin.test.mjs`): `escapeLittle` (every reserved char, hashtags,
  newlines, bullets), `pickMedia` for each media type, publish step resumption with a stubbed client
  (post exists → no second createPost).
- Live smoke test (only with Angad's go-ahead at that moment): `scripts/li-smoke.mjs` posts
  "test, please ignore" with visibility CONNECTIONS, prints the URL, then deletes it.

## One-time setup (Angad)

1. linkedin.com/developers → Create app (needs a LinkedIn Page to associate; any page works).
2. Products tab → add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
3. Auth tab → add redirect URL `http://localhost:3000/api/linkedin/callback`.
4. Copy Client ID / Secret into `.env.local`, restart web job, click Connect in Settings.

## Out of scope

Scheduling, editing/deleting published posts from the app, analytics, mentions, organization pages.
