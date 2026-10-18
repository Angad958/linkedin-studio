# voice.md

Template. `setup.sh` copies it to `~/.claude/linkedin/voice.md` (outside the repo, never committed).
Fill in that copy from your resume: every post, email and LinkedIn message is written from it, and
outreach may only use facts listed under "Proof I can use". Paste 2-3 of your own posts into the
"own posts" slot when you have them; that's the biggest quality jump.

---

## Who I am

- **Name:** {{your name}}
- **What I do, in one sentence:** {{e.g. "I'm a backend engineer at <Company> building payment
  and logistics services: Kafka pipelines, Spring Boot microservices, Redis, on AWS."}}
- **Who I am writing for:** software engineers with 0-5 years of experience who are preparing for
  system design / LLD interviews or are about to own their first production service. Second
  audience: hiring managers and recruiters, who should finish a post thinking "this person has
  actually run things in prod".
- **What I sell:** nothing. The posts are proof of how I think. Never mention job hunting,
  "open to work" or being available in a post.

## Posts (rules that override everything below for LinkedIn posts)

- **No first person.** Posts never say I, me, my, we, our or us. They're written about a case
  study and to the reader ("you"). No personal stories, no "at my company", no mention of my own
  work, numbers or job search.
- **Every post opens with a case study**: a real, sourced incident or engineering story when one
  exists, otherwise a clearly framed "picture this" scenario.
- **Understandable on first read** by a 2nd-year CS student: plain words, every technical term
  explained the first time, one everyday analogy, short sentences.
- The "Recruiter profile" and "Proof I can use" sections are for outreach only. Never put them in a post.

## What I sound like

- **Three of my own posts that sound most like me:** {{paste 2-3 posts here}}
- **Style reference (not mine, but the shape I like):** "Ever wondered how WhatsApp statuses
  disappear after 24 hours?" -> a question hook, a few arrow-step bullets explaining the
  mechanism, one takeaway line, a short explainer visual.
- **Words I actually use:** idempotent, at-least-once, dedup, fan-out, hot path, p99,
  backpressure, shard, canary, rollback, "in prod", "the catch is".
- **Words I would never use:** game-changer, revolutionize, unlock, synergy, "in today's
  fast-paced world", "let that sink in", "here's the thing".
- **Sentence length:** mixed. Short punchy lines for the hook and the turn, normal sentences for
  the explanation.
- **Do I swear:** no
- **Emoji:** one or two, functional only (→ for steps, 💡 for the takeaway). Never rockets or fire.
- **Contractions:** yes
- **Person:** posts are third person + "you" (see Posts above). Emails and DMs are first person.

## My positions

1. {{an opinion you'd defend, e.g. "Exactly-once is mostly a marketing term. At-least-once +
   idempotent consumers is what actually ships."}}
2. {{...}}
3. {{...}}

## Off limits

- **Topics I do not post about:** {{e.g. my employer's internal politics, compensation, colleagues}}
- **Clients or numbers I cannot name publicly:** {{internal service names, dashboards, metrics
  beyond what's on my resume}}. When a draft leans on work details, flag it with {{confirm OK to share}}.
- **Claims I am not allowed to make:** never present a famous company's internal design as
  confirmed fact unless it's from their public engineering blog. Say "a common way to build this
  is..." or "here's how you'd design it" instead.

## Recruiter profile (outreach only)

- **Current role:** {{e.g. SDE at <Company>, <Team>, <City>, since <Mon YYYY>}}
- **Education:** {{e.g. B.Tech, <College>, <Year>}}
- **Stack line:** {{e.g. "Java/Spring Boot services with Kafka, Redis and gRPC on AWS/EKS"}}
- **Location:** {{city, or leave blank to never mention one}}
- **Email signature (exact lines):**
  {{Your Name}}
  {{Role, Company | College 'YY}}

## Proof I can use (outreach only, never in posts)

Copy these from your current resume, with the numbers exactly as written there. Group them by
employer so a past job's result is never credited to the current one.

{{Current employer}}, {{role}}, {{dates}}:
- {{what you built + tech + a number, e.g. "Built Kafka consumer groups over a ~2M events/day
  pipeline with at-least-once delivery and dedup across 3 services."}}
- {{...}}

{{Previous employer}}, {{role}}, {{dates}}:
- {{...}}

Other:
- Stack: {{languages, frameworks, infra}}
- {{education, competitive programming, open source...}}
- NOT on the current resume, never claim: {{anything you've dropped from your resume}}
