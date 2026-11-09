#!/usr/bin/env bash
# tests and reviewer: installs Chrome for Testing with slicc-cdp (CHROME, if set, is the
# version or milestone) and starts Xvfb on :99. Exports CHROME_PATH and DISPLAY.
set -eo pipefail
# Ubuntu 23.10 and later keep unprivileged processes out of user namespaces unless AppArmor
# has a profile for them. Chrome for Testing has none, so its sandbox can't start and Chrome
# aborts (signal 6) when the tests launch it without --no-sandbox (web-test-runner,
# puppeteer). Lift that on runners that have it and allow sudo.
userns=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
if [ "$(cat "$userns" 2>/dev/null)" = 1 ] && sudo -n true 2> /dev/null; then
  sudo sysctl -qw kernel.apparmor_restrict_unprivileged_userns=0
fi
npx --yes "@ai-ecoverse/slicc-cdp@$SLICC_CDP" install-browser --with-deps ${CHROME:+--version "$CHROME"}
echo "CHROME_PATH=$(npx --yes "@ai-ecoverse/slicc-cdp@$SLICC_CDP" find-browser ${CHROME:+--version "$CHROME"} | tail -1)" >> "$GITHUB_ENV"
command -v Xvfb > /dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq xvfb > /dev/null; }
nohup Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp > "$RUNNER_TEMP/xvfb.log" 2>&1 &
for _ in $(seq 50); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.2; done
echo "DISPLAY=:99" >> "$GITHUB_ENV"
