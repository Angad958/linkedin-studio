#!/bin/bash
# One-shot setup for LinkedIn Studio on a Mac. Safe to re-run: it never overwrites your
# .env.local, voice profile or database.
#   ./setup.sh              full install (deps, skills, build, launchd schedules)
#   ./setup.sh --no-schedules   same, but don't install the background jobs
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; MISSING=1; }
MISSING=0

echo "1/6 Checking prerequisites"
[[ "$(uname)" == "Darwin" ]] && ok "macOS" || bad "macOS is required (launchd schedules, Chrome path)"
if command -v node >/dev/null && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]]; then ok "Node $(node -v)"; else bad "Node 22+ (brew install node@22)"; fi
command -v python3 >/dev/null && ok "python3 $(python3 -V 2>&1 | cut -d' ' -f2)" || bad "python3 (brew install python)"
[[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]] && ok "Google Chrome" || bad "Google Chrome in /Applications (renders carousels, diagrams, videos)"
command -v ffmpeg >/dev/null && ok "ffmpeg" || bad "ffmpeg (brew install ffmpeg) for explainer videos"
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || echo "$HOME/.local/bin/claude")}"
[[ -x "$CLAUDE_BIN" ]] && ok "Claude Code CLI ($CLAUDE_BIN)" || bad "Claude Code CLI (https://claude.com/claude-code), then run 'claude' once to log in"
if [[ $MISSING == 1 ]]; then echo; echo "Install the missing items above, then run ./setup.sh again."; exit 1; fi

echo "2/6 Installing npm packages"
npm ci --no-audit --no-fund >/dev/null
ok "node_modules"

echo "3/6 Installing the li-* skills into ~/.claude/skills"
mkdir -p "$HOME/.claude/skills"
for s in skills/li-*; do rsync -a --exclude __pycache__ "$s" "$HOME/.claude/skills/"; done
ok "$(ls -d skills/li-* | wc -l | tr -d ' ') skills"

echo "4/6 Config"
mkdir -p "$HOME/.claude/linkedin" data/logs drafts
if [[ -f "$HOME/.claude/linkedin/voice.md" ]]; then ok "voice profile exists (kept)"; else cp config/voice.md "$HOME/.claude/linkedin/voice.md"; ok "voice profile -> ~/.claude/linkedin/voice.md"; fi
if [[ -f .env.local ]]; then ok ".env.local exists (kept)"; else cp .env.example .env.local; chmod 600 .env.local; ok ".env.local created from .env.example (fill it in, see README)"; fi

echo "5/6 Database + build"
node scripts/seed-topics.mjs
npx next build >data/logs/build.log 2>&1 || { echo "  build failed, see data/logs/build.log"; exit 1; }
ok "production build"

echo "6/6 Background jobs"
if [[ "${1:-}" == "--no-schedules" ]]; then
  ok "skipped (run ./scripts/install-schedules.sh later)"
else
  ./scripts/install-schedules.sh
fi

cat <<'TXT'

Done. Open http://localhost:3000
Next: fill in .env.local (Gmail, LinkedIn keys), put your resume at data/resume.pdf (or set RESUME_PATH),
edit ~/.claude/linkedin/voice.md (who you are + the facts outreach may use),
import contacts, then Settings -> Connect LinkedIn. Step-by-step: README.md, "Set up on a new Mac".
TXT
