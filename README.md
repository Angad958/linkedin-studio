# LinkedIn Studio

Local app at **http://localhost:3000** that:

1. **Writes a LinkedIn post every morning (07:00)** on distributed systems, HLD, LLD, production incidents,
   AI engineering, "how X works" and your own production experience. It uses the LinkedIn Agent Skill pack
   (`/li-post`, `/li-carousel`, `/li-human`) through `claude -p`, and renders a **carousel PDF, diagram PNG
   or 10s explainer MP4/GIF** to go with it.
2. **Waits for your approval.** Review it in the Queue: swap hooks, edit, re-score, regenerate with feedback.
3. **Posts it for you.** After you approve, **Post to LinkedIn** publishes the text and media to your own
   profile through LinkedIn's official API, then logs it to `~/.claude/linkedin/log.md`. Posting the first
   comment (the source link) through the API currently fails with a 403, because LinkedIn only allows that
   for partner apps. Paste it on the post yourself, then click **Skip comment, mark as posted**. The manual
   Publish Kit is still there as a fallback.
4. **Recruiter outreach (Mon-Fri 08:00).** Drafts 20 personalised emails from your HR list. You approve the
   batch, and then it sends them 2-5 min apart (Mon-Fri 9:30-18:00) with your resume attached. Follow-ups go
   out at +4 and +10 days in the same thread, and everything stops when someone replies, bounces or says "stop".
   Each email states your experience, stack and three proof points with numbers, all taken from your voice
   profile. **Send** on any draft (or **Send N now**) sends it immediately instead of waiting for the window.
5. **Auto-post (12:00 daily).** Posts the next approved draft to LinkedIn, one per day, in the order you approved
   them. It skips days you already posted, and won't post after `AUTO_POST_UNTIL` if the Mac slept through noon.
6. **LinkedIn recruiter outreach (Outreach → LinkedIn).** Finds technical recruiters at remote and onsite
   companies (`config/li-targets.example.json`) through web search and drafts a connection note, a first message
   and two follow-ups for each. **You send every invite and DM yourself**: LinkedIn's API doesn't allow apps to,
   and automating it breaks LinkedIn's User Agreement and gets accounts restricted. The tab tracks each person
   (invited → accepted → messaged → follow-ups due) and caps invites at 20 a day.

## Set up on a new Mac

**Before you start:** a Mac, [Node 22+](https://nodejs.org) (`brew install node@22`), Python 3, Google Chrome in
`/Applications`, `ffmpeg` (`brew install ffmpeg`), and [Claude Code](https://claude.com/claude-code). Run
`claude` once to log in, because the daily draft is written by `claude -p`.

1. **Clone and install.**
   ```bash
   git clone <this repo> ~/linkedin-studio && cd ~/linkedin-studio
   ./setup.sh
   ```
   This checks the prerequisites, installs npm packages, copies the 11 `li-*` skills into `~/.claude/skills/`,
   puts the voice profile at `~/.claude/linkedin/voice.md`, creates `.env.local` from `.env.example`, seeds
   the topic list, builds the app and installs the 5 background jobs. The Studio is then at
   http://localhost:3000. It is safe to re-run, and it never overwrites `.env.local`, the voice profile or the
   database.
2. **Fill in `.env.local`.** Set `LINKEDIN_HANDLE` and `FROM_NAME` to your name, `CAREER_START` (YYYY-MM of your
   first full-time job), `TARGET_ROLES`, optionally `CONTACT_PHONE`, and your employer's domains in `EXCLUDE_DOMAINS`.
   Then fill in `~/.claude/linkedin/voice.md` from your resume. Outreach may only use the facts listed under
   "Recruiter profile" and "Proof I can use", so keep the numbers exactly as on your resume.
3. **Gmail** (for recruiter outreach): Google Account → Security → turn on 2-Step Verification →
   "App passwords" → create one. Put your address in `GMAIL_USER` and the 16 characters in `GMAIL_APP_PASSWORD`.
4. **Resume:** copy it to `data/resume.pdf`, or set `RESUME_PATH` to wherever it lives. It's attached under its
   file name, so name it like `Firstname_Lastname_Resume.pdf`. For LinkedIn outreach, copy
   `config/li-targets.example.json` to `config/li-targets.json` and add your employer to `exclude`.
5. **Recruiter contacts:** `node scripts/clean-contacts.mjs path/to/list.csv`. The CSV needs the columns
   `Email,Name,Company,Source Sheet`. The contact list is not in this repo on purpose.
6. **LinkedIn posting:**
   1. At linkedin.com/developers → **Create app**. LinkedIn requires the app to be linked to a LinkedIn Page,
      and any page works. Posts still go to your personal profile.
   2. On the **Products** tab, add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
   3. On the **Auth** tab, add the redirect URL `http://localhost:3000/api/linkedin/callback` exactly. Copy the
      Client ID and Client Secret into `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.
7. **Restart** to load `.env.local`: `launchctl kickstart -k gui/$(id -u)/com.linkedin-studio.web`
8. **Connect:** open Settings → **Connect LinkedIn** and approve. The sign-in lasts 60 days, and the queue
   shows a banner when it's time to Reconnect.
9. **Review `~/.claude/linkedin/voice.md`.** For a better voice match, paste in 2-3 of your own posts, and check
   the "Off limits" section.

**Common errors:** "redirect_uri does not match" means the Auth-tab URL differs from step 6.3.
"Scope openid is not authorized" means the OpenID Connect product from step 6.2 is missing.

## Daily routine (~5 min)
- Morning: macOS notification "LinkedIn draft ready" → open the Studio → Approve → check the preview → **Post to LinkedIn** (or "Post manually instead").
- Morning (weekdays): Outreach tab → skim the 20 emails → "Approve & schedule".
- Replies show up as notifications and in Outreach → Pipeline. Set the status to "interview" when it gets there.

## Commands
```bash
npm run generate                          # today's draft now (skips if it exists)
node scripts/generate.mjs --ahead 3       # fill the next 3 days
node scripts/outreach.mjs --n 20          # draft a recruiter batch now
node scripts/outreach.mjs --redraft       # rewrite the batch awaiting approval (after a prompt change)
node scripts/li-recruiters.mjs --n 15     # find LinkedIn recruiters + draft notes/DMs (--mode remote|onsite)
node scripts/auto-post.mjs --force        # post the next approved draft now (ignores the 12:00 rule)
node scripts/clean-contacts.mjs file.csv  # import another HR list (Email, Name, Company, Source Sheet)
node scripts/send-due.mjs --poll-only --force-poll   # check inbox for replies now
node scripts/publish.mjs --draft 5        # post an approved draft to LinkedIn (what the button runs)
node scripts/li-smoke.mjs                 # live API check: connections-only test post, deleted after you look
node --test                               # unit tests
./scripts/install-schedules.sh            # (re)install the launchd jobs
./scripts/uninstall-schedules.sh          # stop everything
```
Logs: `data/logs/`. Database: `data/studio.db`. Drafts and media: `drafts/<date>-<id>/`.

## How contacts are ranked
The HR list is cleaned on import. Glued-together cells get split, invalid addresses and dead domains (no mail
server) are dropped, and your `EXCLUDE_DOMAINS` are skipped. Each contact gets a score: your "MY LIST" rows and the recent sheets
score highest, then named people over shared inboxes, then product companies. **Tier A** is emailed first, and
**tier B** only while the bounce rate stays under 3%. Sending pauses itself if bounces exceed 6% or Gmail rejects
the login. Only one person per company is emailed at a time.

## Safety limits (change in `.env.local`)
20 new emails/day, 45 total/day including follow-ups, weekdays only, every email ends with a one-line
"reply stop" opt-out. Gmail allows ~500/day, but cold email from a personal account gets flagged long before that,
so keep these low.
