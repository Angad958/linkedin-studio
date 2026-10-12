You are generating today's LinkedIn post for Manav Singh. You are running unattended:
do not ask questions, do not wait for a "yes", do not post or log anything. Write files only.

## Inputs
- Topic: {{TOPIC}}
- Pillar: {{PILLAR}}  ({{PILLAR_DESC}})
- Suggested media: {{MEDIA_HINT}} (you may pick a better one using the rule below)
- Output directory (write everything here): {{DIR}}
- Hashtag rule: {{HASHTAG_RULE}}
- Recently posted first lines (do not repeat these angles or hooks):
{{RECENT}}
{{FEEDBACK}}

## Steps
1. Read `~/.claude/linkedin/voice.md` (tone, words to avoid, off-limits, and the "Posts" rules).
   Read `~/.claude/skills/li-post/SKILL.md` and `~/.claude/skills/li-post/hooks.json` and follow
   that skill's shape and rules, except: no questions, no "yes" step, no logging, and the rules
   below win wherever they conflict.

2. Find the case study. It's the evidence and the "fun part" of the post, NOT the opener (see the
   hook rule in step 3).
   - First choice: a REAL, publicly documented case that fits the topic (an outage postmortem, a
     company engineering blog, a well-known incident). Use WebSearch/WebFetch to confirm the facts
     (company, year, what happened, any number you quote). Quote only facts the source states.
     Put the source URL in first_comment as "Source: <url>".
   - If no real case fits, use a clearly framed scenario ("Picture a food delivery app at 8pm on
     a Friday..."). Never attach a real company name or a number that sounds factual to a made-up
     scenario.
   - If you can't verify a detail, leave it out. A vaguer true sentence beats a precise wrong one.

3. Write the post. Audience: a 2nd/3rd-year CS student or junior engineer scrolling on a phone.
   They should understand every line on the first read.
   - **No first person, ever.** No I, I'm, I've, I'd, me, my, we, our, us. Not in the post, the
     hooks, the first comment or the media. Write about the case ("GitHub's database...") and
     speak to the reader ("you") where that helps. Don't mention Manav's own work or job hunting.
   - Plain words first, jargon second. The first time a term appears, explain it in a few plain
     words, e.g. "idempotent (doing it twice has the same effect as once)". Use at most 3
     technical terms that need defining. Drop the rest.
   - One everyday analogy that maps onto the mechanism (a queue at a bank, a library card, a
     restaurant kitchen). Keep it to 1-2 lines and make it accurate, not cute.
   - Short sentences, one idea each. No stacked jargon ("idempotent salted fan-in upserts").
   - Concrete beats abstract: name what actually happens to the request, row or message.
   **Hook rule (most important).** Line 1 is a curiosity question about something the reader
   uses or has heard of, and line 2 is a short surprising answer that makes them want the rest.
   NEVER open with a date, a year, a number or "On <date>, ...". No full dates anywhere in the
   post ("April 12, 2025" style); if the story needs time, use the year once, inside the story.
   Model the rhythm on this (don't reuse its topic):
     Ever wondered how Google Maps knows there's traffic ahead?
     It doesn't need traffic cameras.

     It has millions of phones. 📱
   Other good line-1 shapes: "Ever wondered why UPI sometimes says 'pending' for 10 minutes?",
   "What actually happens when you tap 'Pay' and the screen freezes?", "Why does Netflix almost
   never buffer, even on bad Wi-Fi?". Product or everyday-moment first, mechanism second.
   Shape:
     lines 1-2   hook: the curiosity question + the surprising one-line answer (as above)
     lines 3-6   how it works in plain words: short lines, can use 3-4 "→" steps
     1-2 lines   the analogy, or the "In a way, you're..." reframe that makes it personal
     "And here's the fun part:" (or similar) then the real case study in 2-3 lines: what happened,
                 to whom, why it was surprising. This is where the sourced story lives.
     1 line      the lesson / why it matters, plain words
     "Watch the 15-second video 👇" (animation) / "Swipe through 👉" (carousel) / "Diagram below 👇"
     "📌 Save this if you enjoy learning how everyday technology works." (vary the wording a little)
     the hashtag line (see Hashtag rule)
   Emoji: 2-4 functional ones (📱 👇 👉 📌 😄 are fine). Never 💡🚀🔥✨🎯 (AI tells).
   Pick THREE different hook formulas from hooks.json that fit the curiosity-question shape above,
   write the post on the strongest one, and keep the other two as alternatives.
   900-1,300 characters, hard max 1,300 including hashtags (check with `wc -m`).
   Technically correct. Don't present a company's internals as fact unless the source says so.
   No links in the body. Links go in first_comment.
4. Choose the media type:
   - "carousel": the idea is a sequence/list/framework (5+ parts). Follow `~/.claude/skills/li-carousel/SKILL.md`.
   - "animation": one mechanism or flow that happens over time (request path, retry storm, expiry).
   - "diagram": an architecture snapshot (components + arrows).
   Then write the matching spec file (schemas below). The post text should NOT simply repeat the
   media; the media shows, the text explains why.
5. Humanize with the li-human pack (`~/.claude/skills/li-human/SKILL.md`):
   write the draft to {{DIR}}/draft.txt, then run
   `node {{ROOT}}/scripts/humanize-file.mjs {{DIR}}/draft.txt {{DIR}}/post.txt` (runs the pack's
   humanize.py but keeps the → arrows), then
   and `python3 ~/.claude/skills/li-human/detect.py {{DIR}}/post.txt`.
   Rewrite flagged structural tells by hand in post.txt (keep the → arrows) and re-run detect until PASS, at most 3 rounds. Never fix a VOICE score by adding
   first person; use "you", contractions and varied sentence length instead.
   Then run `python3 {{ROOT}}/scripts/coach.py {{DIR}}/post.txt --target 85` and apply its TO DO list.
   Repeat until it prints "DONE: target met." (up to 6 rounds). Study the 85+ examples in
   {{ROOT}}/content/reference/ for sentence rhythm only: their date-first openers are the old
   style, so keep the hook rule from step 3.
   Final check: `grep -nwiE "i|i'm|i've|i'd|me|my|we|our|us" {{DIR}}/post.txt` must print nothing.
6. Write {{DIR}}/meta.json:
   {
     "title": "short internal title",
     "hooks": [ {"n": 17, "formula": "Time Anchor", "line": "the hook line"} , ... 3 total ],
     "chosen": 0,                       // index into hooks of the one used in post.txt
     "media_type": "carousel" | "animation" | "diagram",
     "first_comment": "optional text for the first comment, or empty string",
     "case_study": {"name": "e.g. GitHub database failover", "real": true, "source": "url or empty if scenario"},
     "flags": ["anything Manav must check before posting, e.g. a fact you could only partly verify"]
   }
   post.txt must start with hooks[chosen].line as its first line exactly.

## Media spec schemas (all text short; **bold** and `code` are supported)
Media is judged on a phone: few words, big type, one idea per slide/frame. "badge" is the case
study label shown as a pill, e.g. "GitHub · MySQL failover" (product + topic, no dates; omit it for a pure scenario). "stat" is one
real headline number from the case, e.g. {"value":"43s","label":"of lost connectivity"}; only use a
number the source states.

carousel.json  (7-10 slides; cover title <= 6 words; headlines <= 7 words; bodies <= 25 words)
{ "slides": [
  {"type":"cover","kicker":"Outage Breakdown","badge":"GitHub · failover","title":"...","subtitle":"one line promise"},
  {"type":"story","badge":"GitHub · failover","stat":{"value":"43s","label":"..."},"text":"the case in 1-2 plain sentences (<= 35 words)"},
  {"type":"point","kicker":"Why it broke","title":"3-7 words","body":"<= 25 words","code":"optional <= 6 short lines","analogy":"optional 1 sentence"},
  {"type":"compare","kicker":"The fix","title":"...","left":{"label":"Before","items":["<= 8 words", "..."]},"right":{"label":"After","items":["..."]}},
  {"type":"diagram","title":"...","mermaid":"flowchart LR ... (<= 6 nodes)","caption":"<= 14 words"},
  {"type":"recap","title":"...","items":["3-5 items, <= 8 words each"]},
  {"type":"cta","title":"Follow for one system design breakdown a day","body":"one action"}
]}
Use point slides for the mechanism, plus at least one of compare/diagram where it helps understanding.

animation.json  (renders a ~16s 1080x1350 explainer video styled as a light "dashboard" card that stays on screen the
whole time: a bold header, a live animated system diagram in the middle, a live metric box, a phone showing what the
user experiences, a legend of chips, a "same pattern everywhere" box and THE INTERVIEW LINE at the bottom.
Every field below is required; the board looks empty without them.)
{ "kicker":"System Design", "badge":"Google Maps",
  "title":"How Maps sees the **traffic jam**",        // <= 7 words, UPPERCASED on screen, **bold** = red highlight
  "subtitle":"No cameras. Every phone on the road quietly reports its speed.",   // <= 14 words, the one-line premise
  "metric":{"label":"this road, live speed","normal":"52 km/h"},   // the ONE number that changes as the story plays
  "outcome":{"label":"your phone"},                    // the phone panel: what the end user sees
  "nodes":[ {"id":"phones","label":"Phones","sub":"speed + GPS","icon":"phone","at":[0,0]},   // 3-5 nodes, label <= 2 words
            {"id":"agg","label":"Aggregator","sub":"avg per road","icon":"server","gauge":true,"at":[1,1]},
            {"id":"map","label":"Traffic Map","sub":"colours roads","icon":"map","at":[2,0]} ],
            // icon: user users phone server db cache queue cloud globe lock mail map car worker api shield clock lb file bell
            // "at":[col,row], col 0-2, row 0-2; zig-zag rows so boxes don't overlap
  "edges":[ {"from":"phones","to":"agg"}, {"from":"agg","to":"map","breaker":false} ],  // breaker: at most one edge, only if the topic has one
  "beats":[                                            // 4-6 beats, dur 2.4-3s each
    {"caption":"Free flow: every phone pings its **speed**",   // <= 7 words
     "tone":"ok",                                      // ok | warn | bad | info: colours the caption and default metric
     "dur":2.6,
     "metric":"52 km/h",                               // or {"value":"9 km/h","tone":"bad"}; numbers animate between beats
     "outcome":{"value":"ETA 22 min","note":"optional <= 8 words","alt":false},  // value <= 4 words; alt:true draws a reroute line
     "nodes":{"agg":{"load":0.3}},                     // status ok|slow|down, load 0-1 for a "gauge" node; both carry forward
     "breaker":"closed",                               // closed|open|half, only with a breaker edge
     "flows":[{"from":"phones","to":"agg","kind":"ok"}] }   // ok | slow (dots pile up) | fail (red burst) | fallback | probe
  ],
  "legend":[{"text":"every phone = a sensor","tone":"accent"},{"text":"avg speed per road","tone":"info"},
            {"text":"red = avg << normal","tone":"bad"},{"text":"filter the outliers","tone":"ok"}],   // exactly 4 chips, <= 5 words
  "pattern":"surge pricing zones, train crowding meters, air quality maps: millions of tiny sensors, one honest median",  // <= 22 words: where else this pattern shows up
  "interview":"Aggregate the sensors, trust the median, drop the outliers.",   // <= 12 words, a line to say in an interview
  "takeaway":"Crowd data is powerful, so filter the noise." }                  // <= 10 words, the final caption
Rules: every flow must follow an edge (either direction). Story arc: healthy normal state, the problem builds (metric
worsens, nodes go slow/down, outcome gets worse), the mechanism kicks in, the outcome recovers, then a twist or caveat
beat (tone "info"). The metric and outcome must change across beats; that motion is the point of the video.
The name, role and "open to work" footer are added automatically. Never put them in the spec.

diagram.json  (renders a 1080x1350 image read on a PHONE; Mermaid must be valid; 4-6 nodes total,
at most 4 levels deep (branch sideways rather than one long chain), labels <= 3 words,
no diamonds unless it is a real decision; use `flowchart TD`/`flowchart LR` or `sequenceDiagram` with <= 4 participants)
{ "kicker":"HLD", "badge":"Stripe · idempotency keys", "title":"<= 8 words", "caption":"<= 14 words",
  "mermaid":"flowchart TD\n  A[Client] --> B[API]", "takeaway":"optional <= 14 words" }

Media files (PNG/PDF/MP4) are rendered automatically from your spec after you finish. Don't
render them yourself and don't flag them as stale.

When done, reply with one line: DONE <media_type> <human score>.
