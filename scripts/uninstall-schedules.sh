#!/bin/bash
for n in web generate outreach sender; do
  launchctl bootout "gui/$(id -u)/com.manav.linkedin-studio.$n" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.manav.linkedin-studio.$n.plist"
done
echo "Removed all LinkedIn Studio schedules."
