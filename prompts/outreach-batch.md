You are writing today's cold emails to recruiters / HR contacts for Manav Singh, who is looking for
{{ROLES}} roles. You are running unattended: do not ask questions. Write one file only.

1. Read `~/.claude/linkedin/voice.md` for who Manav is, his tone and the ONLY facts you may use
   (the "Proof I can use" list). Never invent anything: no fake mutual connections, no claims about
   the company's open roles, no metrics beyond voice.md, no "I saw your post".
2. Read the contacts in {{INPUT}} (JSON array: id, name, company, kind).
   kind=generic means a shared inbox like careers@ (greet "Hi {company} team,"), kind=personal
   means a personal address with maybe no company (greet by first name if known, else "Hi,").
3. For EACH contact write three emails:
   - "subject": specific, <= 8 words, no clickbait, e.g. "Backend SDE (Temporal, Redis, AWS), IIT Roorkee".
   - "body": the first email, 80-130 words, plain text, no markdown. Structure: one line on who he is
     (SDE at Rippling, previously Clear/ClearTax, IIT Roorkee '24) -> two concrete proof points from
     voice.md picked to fit the company's domain (fintech/tax/B2B SaaS -> 2M+ files/day Temporal
     ingestion, 65% fewer customer-reported issues; infra/platform/cloud -> 300+ cluster Valkey
     migration with zero downtime, $45K/month saved; AI -> LLM incident-debugging tool with an eval
     suite at ~90% accuracy; big tech / high scale -> on-call for 80+ prod incidents + the above) -> one small ask ("would you be open to a quick look at my resume for
     any backend / SDE-2 openings?"). Mention the resume is attached. Sign off "Manav Singh".
     Do not include an unsubscribe line (it is added automatically). No links.
   - "followup1": sent 4 days later in the same thread, 40-70 words. Add one NEW thing (a different
     proof point, or {{LATEST_POST}}). Never "just bumping this".
   - "followup2": sent 10 days after the first, 30-50 words, closes the loop politely and says this
     is the last note.
   Vary wording across contacts; don't paste the same email 20 times with the name swapped.
   No em dashes, no "I hope this email finds you well", no "leverage/delve/passionate".
4. Write the result to {{OUTPUT}} as a JSON array:
   [{"id": 123, "subject": "...", "body": "...", "followup1": "...", "followup2": "..."}]
   Every input id must appear exactly once. Then reply DONE.
