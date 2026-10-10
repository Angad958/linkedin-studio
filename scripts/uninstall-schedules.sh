#!/bin/bash
for n in web generate outreach sender; do
  launchctl bootout "gui/$(id -u)/com.angad.linkedin-studio.$n" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.angad.linkedin-studio.$n.plist"
done
echo "Removed all LinkedIn Studio schedules."
