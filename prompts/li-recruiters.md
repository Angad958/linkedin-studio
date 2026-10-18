You are finding recruiters on LinkedIn for {{NAME}} (looking for {{ROLES}} roles, {{YEARS}} yrs of
experience) and writing the messages they will send BY HAND. You are running unattended: do not
ask questions. Write one file only. Never open or fetch linkedin.com pages; use web search results only.

1. Read `~/.claude/linkedin/voice.md` (tone, "Recruiter profile", and "Proof I can use": the ONLY
   facts you may use; never use anything it lists under "never claim") and the
   `li-dm` skill at `~/.claude/skills/li-dm/SKILL.md` (the rules for notes, DMs and follow-ups).
2. Read {{TARGETS}} (companies grouped "remote" / "onsite", plus "exclude") and {{SKIP}} (profile URLs
   already in the list; never return these).
3. Find {{N}} recruiters, about half at "remote" companies and half at "onsite" companies{{MODE_FILTER}}.
   Use WebSearch, e.g. `site:linkedin.com/in "technical recruiter" Razorpay Bengaluru` or
   `site:linkedin.com/in "talent acquisition" "engineering" Atlassian India`.
   Who counts (top tier): technical recruiters, talent acquisition partners/leads, or engineering
   hiring managers who hire backend / SDE-2 engineers in India (or remote-from-India). Prefer people
   whose search snippet says they hire engineers. Skip agency/staffing-firm recruiters, sales or
   non-tech HR, and anyone at an excluded company. Max 2 people per company per run.
   Every person MUST come from a search result showing a linkedin.com/in/ URL. Copy name, title and
   company from that result. Never guess a URL or a name.
4. For each company, decide "mode" for SDE roles in India: "remote" only if a search result (careers
   page, job post, company policy) shows remote engineering hiring in India; otherwise "hybrid" or
   "onsite". Put the source in "evidence" in a few words, e.g. "Atlassian careers: Team Anywhere".
   "tier": "A" for big tech, top-funded product companies and the remote list; "B" otherwise.
5. Write, per person, following li-dm:
   - "note": connection note, MAX 190 characters including spaces. One specific reference to them or
     their company's engineering, one line on who the sender is with years + stack. No ask, no links.
     e.g. "Hi Priya, I see you hire backend engineers at Razorpay. I'm a backend SDE at <Company> (2+ yrs,
     Java/Kafka, payment flows). Would be glad to connect." Count the characters.
   - "dm" (after they accept, 3-4 sentences): thanks for connecting, the role they're after (SDE-2 /
     backend, remote or onsite matching the company's mode), ONE concrete proof point with tech + a
     number picked for the company's domain, and one small ask: "Could I share my resume for any
     SDE-2 backend openings on your team?" No links, no calendar.
   - "followup1" (+4 days, 1-3 sentences): one NEW proof point with a number. Never "just bumping".
   - "followup2" (+10 days, 1-2 sentences): closes the loop, says this is the last note.
   No em dashes, no "I hope this finds you well", no "passionate/leverage/delve/exciting opportunity".
   Never state where they will work or relocate to (no city, no "happy to move/work from X"): say only
   "remote" or "onsite/hybrid" roles. Use a location only if voice.md states it.
6. Write {{OUTPUT}} as a JSON array:
   [{"profile_url": "https://www.linkedin.com/in/...", "name": "...", "title": "...", "company": "...",
     "mode": "remote|hybrid|onsite", "tier": "A|B", "evidence": "...",
     "note": "...", "dm": "...", "followup1": "...", "followup2": "..."}]
   Fewer than {{N}} real people is fine; never pad with guesses. Then reply DONE.
