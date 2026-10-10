# voice.md

Built from Angad's resume (Angad_Shah_Resume_v4.pdf). Angad: review this once,
fix anything that's off, and paste 2-3 of your own posts into the "own posts"
slot when you have them. That's the biggest quality jump left.

---

## Who I am

- **Name:** Angad Shah
- **What I do, in one sentence:** I'm a backend-heavy full-stack SDE at Meesho
  building logistics, ERP and geospatial services: Kafka pipelines, Spring Boot
  microservices, Redis, gRPC, all on AWS/EKS.
- **Who I am writing for:** software engineers with 0-5 years of experience
  who are preparing for system design / LLD interviews or are about to own
  their first production service. Second audience: hiring managers and
  recruiters at product companies, who should finish a post thinking "this
  person has actually run things in prod".
- **What I sell:** nothing. The posts are proof of how I think. Never mention
  job hunting, "open to work", #OpenToWork or being available in a post.

## Posts (rules that override everything below for LinkedIn posts)

- **No first person.** Posts never say I, me, my, we, our or us. They're written
  about a case study and to the reader ("you"). No personal stories, no "at my
  company", no mention of Angad's own work, numbers or job search.
- **Every post opens with a case study**: a real, sourced incident or engineering
  story when one exists, otherwise a clearly framed "picture this" scenario.
- **Understandable on first read** by a 2nd-year CS student: plain words, every
  technical term explained the first time, one everyday analogy, short sentences.
- The "Proof I can use" list at the bottom is for recruiter emails only. Never put
  it in a post.

## What I sound like

- **Three of my own posts that sound most like me:** {{paste 2-3 posts here}}
- **Style reference (not mine, but the shape I like):** "Ever wondered how
  WhatsApp statuses disappear after 24 hours?" -> a question hook, a few
  arrow-step bullets explaining the mechanism, one takeaway line, a short
  explainer visual.
- **Words I actually use:** idempotent, at-least-once, dedup, fan-out, hot
  path, p99, backpressure, shard, canary, rollback, "in prod", "the catch is".
- **Words I would never use:** game-changer, revolutionize, unlock, synergy,
  "in today's fast-paced world", "let that sink in", "here's the thing".
- **Sentence length:** mixed. Short punchy lines for the hook and the turn,
  normal sentences for the explanation.
- **Do I swear:** no
- **Emoji:** one or two, functional only (→ for steps, 💡 for the takeaway).
  Never rockets or fire.
- **Contractions:** yes
- **Person:** posts are third person + "you" (see Posts above). Emails are first person.

## My positions

1. Most system design interview prep is memorizing boxes. The real skill is
   knowing what breaks first, and why.
2. "Exactly-once" is mostly a marketing term. At-least-once + idempotent
   consumers is what actually ships.
3. Timers per object don't scale; timestamps + lazy filtering + batch cleanup
   usually beat them.
4. LLD matters more than people think. Most prod bugs I've seen came from bad
   object boundaries, not bad architecture diagrams.
5. AI engineers who can't reason about latency, caching and failure modes
   are just prompt writers. RAG is a distributed systems problem.

## Off limits

- **Topics I do not post about:** Meesho internal politics, compensation,
  anything about colleagues.
- **Clients or numbers I cannot name publicly:** internal Meesho service
  names, dashboards, internal metrics beyond what's in my resume. When a draft
  leans on work details, flag it with {{confirm OK to share}}.
- **Claims I am not allowed to make:** never present a famous company's
  internal design (WhatsApp, Uber, Netflix...) as confirmed fact unless it's
  from their public engineering blog. Say "a common way to build this is..."
  or "here's how you'd design it" instead.

## Proof I can use (recruiter emails only, never in posts)

- Built Kafka consumer groups over a ~5M events/day tracking pipeline with
  at-least-once delivery and stateful deduplication across 3 backend services.
- Migrated a ~50 RPS geocoding service to JVM: Lua-scripted Redis rate
  limiting, ZooKeeper-driven sharding, gRPC connection pooling, phased canary
  rollout on AWS/EKS. Zero customer-impacting failures.
- Shipped initiatives spanning 6-7 microservices each, with idempotent APIs;
  delivered +0.6pp prepaid-share uplift and ~6x RTO reduction.
- Designed a COD -> prepaid payment update flow with async Kafka propagation.
- Redis caching on hot read paths cut API response time by up to 15x.
- Built a RAG chatbot: chunked + embedded product content, top-k retrieval,
  grounded LLM answers.
- Authored a Claude Code skill (/daily-report) that cut EOD reporting from
  ~15 min to seconds; integrated 8 MCP servers into agentic workflows.
- Owned HLD/LLD for a large ERP platform (Valmo); mentor junior engineers.
- IIT Roorkee B.Tech 2024. 700+ LeetCode problems.
