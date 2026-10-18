#!/bin/bash
for n in web generate outreach sender autopost; do
  launchctl bootout "gui/$(id -u)/com.linkedin-studio.$n" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.linkedin-studio.$n.plist"
done
echo "Removed all LinkedIn Studio schedules."
