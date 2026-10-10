#!/usr/bin/env python3
"""Score a post with the li-human detector and print concrete fixes to reach a target.

usage: python3 scripts/coach.py post.txt [--target 85]
Exit code 0 when the target is met (and length/first-person rules pass), 1 otherwise.
"""
import json
import os
import re
import statistics
import sys

HUMAN_DIR = os.path.expanduser("~/.claude/skills/li-human")
sys.path.insert(0, HUMAN_DIR)
import detect  # noqa: E402

FIRST_PERSON = re.compile(r"\b(I|I'm|I've|I'd|I'll)\b|\b(me|my|mine|myself|we|we're|we've|we'd|we'll|our|ours|ourselves|us)\b", re.I)


def main():
    args = sys.argv[1:]
    path = args[0]
    target = float(args[args.index("--target") + 1]) if "--target" in args else 85.0
    text = open(path, encoding="utf-8").read()
    lex = json.load(open(os.path.join(HUMAN_DIR, "slop.json"), encoding="utf-8"))
    results, overall, verdict = detect.run(text, lex)

    words = detect.words(text)
    n = max(len(words), 1)
    per100 = 100 / n
    sents = detect.sentences(text)
    lens = [len(s.split()) for s in sents]
    cv = statistics.pstdev(lens) / statistics.mean(lens) if len(lens) > 1 else 0
    contractions = len(detect.CONTRACTIONS.findall(text))
    pronouns = len(detect.PRONOUNS.findall(text))
    numbers = len(detect.NUMBERS.findall(text))
    proper = sorted(set(detect.PROPER.findall(text)))
    chars = len(text.strip())

    print(f"HUMAN SCORE {overall:.1f} {verdict}   target {target:.0f}   length {chars} chars (900-1300)")
    for name, (score, detail) in results.items():
        print(f"  {name:<13} {score:5.1f}  {detail}")
    weakest = min(results, key=lambda k: results[k][0])
    print(f"\nWeakest: {weakest}. The final score is 60% average + 40% weakest, so fix this first.\n")

    todo = []
    if cv < 0.62:
        todo.append(f"BURSTINESS: variation {cv:.2f}, need >= 0.62. Lengths now: {lens}. "
                    "Turn 2-3 mid-length sentences into 3-5 word punches (2-word sentences don't count), "
                    "and merge or extend one into a single 28-35 word sentence.")
    density = (numbers + len(proper)) * per100
    if density < 5.5:
        need = int((5.5 / per100) - numbers - len(proper)) + 1
        todo.append(f"SPECIFICITY: {density:.1f} per 100 words, need >= 5.5 (about {need} more). Add real numbers "
                    "(dates, counts, latencies, versions) or names MID-sentence. Names at the start of a sentence "
                    f"don't count. Counted names: {', '.join(proper) or 'none'}.")
    if contractions * per100 < 3.2:
        need = int(3.2 / per100 - contractions) + 1
        todo.append(f"VOICE/contractions: {contractions * per100:.1f} per 100 words, need >= 3.2 (about {need} more): "
                    "it's, don't, can't, won't, you'd, that's, isn't, wasn't, you're.")
    if pronouns * per100 < 4.5:
        need = int(4.5 / per100 - pronouns) + 1
        todo.append(f"VOICE/reader: {pronouns * per100:.1f} you/your per 100 words, need >= 4.5 (about {need} more). "
                    "Address the reader: 'your service', 'you'd see', 'if you've ever'. Never use I/we/my/our/us.")
    voice_detail = results.get("VOICE", (0, ""))[1]
    if "tell" in voice_detail and not voice_detail.split("structural tell")[0].strip().endswith(" 0"):
        todo.append(f"VOICE/tells: remove the flagged structures {voice_detail[voice_detail.find('['):]}. "
                    "Bulb/rocket/fire/sparkle emoji count as tells, so write 'Takeaway:' instead of an emoji.")
    fp = [l for l in text.splitlines() if FIRST_PERSON.search(re.sub(r"\bus-[a-z]|\bI/O\b|\bU\.?S\.?\b", "", l))]
    if fp:
        todo.append("FIRST PERSON (not allowed): " + " | ".join(fp))
    if chars > 1300:
        todo.append(f"LENGTH: {chars} chars, cut to <= 1300.")
    if chars < 900:
        todo.append(f"LENGTH: {chars} chars, expand to >= 900.")

    ok = overall >= target and not fp and 900 <= chars <= 1300
    print("DONE: target met." if ok else "TO DO:\n- " + "\n- ".join(todo or ["raise the weakest check above"]))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
