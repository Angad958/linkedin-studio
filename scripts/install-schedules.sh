#!/bin/bash
# Installs (or re-installs) the four launchd jobs. Run again after moving the project.
#   web       keeps the Studio running at http://localhost:3000
#   generate  07:00 daily: writes today's post draft (catches up after sleep)
#   outreach  08:00 Mon-Fri: drafts the next 20 recruiter emails for approval
#   sender    every 2 min: sends approved emails within the window, checks replies every 30 min
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LA="$HOME/Library/LaunchAgents"
PATHS="$(dirname "$NODE"):$HOME/.local/bin:$HOME/.local/opt/ffmpeg:/Library/Frameworks/Python.framework/Versions/3.9/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$LA" "$DIR/data/logs"

write() { # name, program-args-xml, schedule-xml
  cat > "$LA/com.angad.linkedin-studio.$1.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.angad.linkedin-studio.$1</string>
  <key>ProgramArguments</key><array>$2</array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATHS</string><key>HOME</key><string>$HOME</string></dict>
  <key>StandardOutPath</key><string>$DIR/data/logs/$1.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/logs/$1.log</string>
  $3
</dict></plist>
PL
}
s() { echo "<string>$1</string>"; }

write web "$(s "$NODE")$(s "$DIR/node_modules/next/dist/bin/next")$(s start)$(s -p)$(s 3000)" "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>"
write generate "$(s "$NODE")$(s "$DIR/scripts/generate.mjs")" "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>"
WEEKDAYS=""; for d in 1 2 3 4 5; do WEEKDAYS+="<dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>"; done
write outreach "$(s "$NODE")$(s "$DIR/scripts/outreach.mjs")" "<key>StartCalendarInterval</key><array>$WEEKDAYS</array>"
write sender "$(s "$NODE")$(s "$DIR/scripts/send-due.mjs")" "<key>StartInterval</key><integer>120</integer><key>RunAtLoad</key><true/>"

for n in web generate outreach sender; do
  launchctl bootout "gui/$(id -u)/com.angad.linkedin-studio.$n" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LA/com.angad.linkedin-studio.$n.plist"
done
echo "Installed. Studio: http://localhost:3000   Logs: $DIR/data/logs/"
