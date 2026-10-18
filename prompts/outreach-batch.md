You are writing today's cold emails to recruiters / HR contacts for {{NAME}}, who is looking for
{{ROLES}} roles. You are running unattended: do not ask questions. Write one file only.

A recruiter decides in about 10 seconds. After the first 3 lines they must know: who the sender is, how
much experience they have, what stack they work in, and the scale they have worked at. Vague lines lose them.

1. Read `~/.claude/linkedin/voice.md`: tone, the "Recruiter profile" section (current role, education,
   stack line, signature) and "Proof I can use", which holds the ONLY facts and numbers you may use.
   Never invent anything: no fake mutual connections, no claims about the company's open roles,
   products or tech stack, no metrics beyond voice.md, no "I saw your post", no notice period or salary,
   nothing voice.md lists under "never claim".
2. Read the contacts in {{INPUT}} (JSON array: id, name, company, kind).
   kind=generic means a shared inbox like careers@ (greet "Hi {company} team,"), kind=personal
   means a personal address with maybe no company (greet by first name if known, else "Hi,").
   Pick a track per contact from the company: payments/fintech, logistics/e-commerce,
   AI/SaaS/devtools, big tech/infra, or general (unknown or no company).
3. For EACH contact write three emails.

   "subject" (<= 10 words): role + experience + 2 key skills + current company or school, e.g.
   "SDE-2 Backend | {{YEARS}} yrs | Java, Kafka | <Company>". No questions, no clickbait.

   "body" (130-180 words, plain text, no markdown except "- " bullets), in this order:
   a. Greeting.
   b. Intro, one sentence: name, current role and company, {{YEARS}} years of experience, education,
      and the role being asked about at this company ("backend roles" when the company is unknown).
   c. What they do, one sentence: team/domain + stack, from the "Recruiter profile" stack line.
   d. Three "- " bullets picked for the track from "Proof I can use". Each bullet MUST have all of:
      what was built, the tech, and a number (scale or result).
      Good: "- Built Kafka consumer groups for a ~2M events/day pipeline, with at-least-once delivery."
      Bad: "- Worked on Kafka pipelines."
      Match proof to track: payments work for fintech, pipelines/throughput for logistics and
      e-commerce, AI/LLM work for AI/SaaS, scale + reliability + migrations for big tech/infra.
      Keep each fact with the employer voice.md lists it under; never move a previous job's
      result to the current employer.
   e. One line on fit, true from the sender's side only ("Most of my work is event-driven backend
      systems at high volume, which is why I'm writing to <company>."). Never claim what the company uses.
   f. Ask: "Would you be open to a look at my resume (attached) for any <role> openings?"
   g. Sign-off: the signature lines from the "Recruiter profile" section, then {{PHONE}} on its own line
      if it is not empty.

   "followup1" (50-80 words): sent 4 days later in the same thread. One NEW concrete proof point not
   used in the body, written with tech + number, or {{LATEST_POST}}. Restate the role in a few words.
   Never "just bumping this". Sign off with the name only.

   "followup2" (30-50 words): sent 10 days after the first. Closes the loop politely, says this is
   the last note, repeats a one-line summary (role, {{YEARS}} yrs, main stack, current company).
   Sign off with the name only.

   Banned (vague filler): "a couple of things", "things I've built", "relevant experience",
   "I like working on", "problems are the kind", "passionate", "worked on", "various",
   "exciting opportunity", "I hope this email finds you well", "leverage", "delve", em dashes.
   Vary wording across contacts; don't paste the same email 20 times with the name swapped.
   Do not include an unsubscribe line (it is added automatically). No links in the body.
4. Write the result to {{OUTPUT}} as a JSON array:
   [{"id": 123, "subject": "...", "body": "...", "followup1": "...", "followup2": "..."}]
   Every input id must appear exactly once. Then reply DONE.
