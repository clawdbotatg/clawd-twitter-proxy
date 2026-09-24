#!/bin/sh
# Install (or restart) the worker as a launchd agent: KeepAlive, logs in worker/state/.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.clawd.burn-to-tweet-worker
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
[ -f "$ROOT/worker/.env" ] || { echo "missing worker/.env (copy worker/.env.example)"; exit 1; }
(cd "$ROOT/worker" && npm install --silent)
mkdir -p "$ROOT/worker/state"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$(command -v node)</string><string>$ROOT/worker/worker.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT/worker</string>
  <key>EnvironmentVariables</key><dict><key>HOME</key><string>$HOME</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string><key>USER</key><string>$USER</string><key>LOGNAME</key><string>$USER</string><key>TMPDIR</key><string>${TMPDIR:-/tmp/}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ExitTimeOut</key><integer>300</integer>
  <key>StandardOutPath</key><string>$ROOT/worker/state/worker.log</string>
  <key>StandardErrorPath</key><string>$ROOT/worker/state/worker.log</string>
</dict></plist>
PL
# bootout sends SIGTERM; the worker finishes in-flight jobs (≤5 min) first.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "worker running: tail -f $ROOT/worker/state/worker.log"
