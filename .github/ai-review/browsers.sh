#!/usr/bin/env bash
# reviewer, in a step after display.sh (it needs CHROME_PATH and DISPLAY): installs
# slicc-cdp's playwright-cli and curlwright to $RUNNER_TEMP/bin and starts one headed
# Chrome per tree with CDP enabled, the head's on 9301 and the base's on 9302.
set -eo pipefail
: "${CHROME_PATH:?run display.sh in an earlier step}" "${DISPLAY:?run display.sh in an earlier step}"
curl -fsSL "https://github.com/ai-ecoverse/slicc-cdp/releases/download/v$SLICC_CDP/install.sh" \
  | sh -s -- --version "$SLICC_CDP" --dir "$RUNNER_TEMP/bin"
echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"
port=9301
for side in head base; do
  profile=$RUNNER_TEMP/browser-$side
  mkdir -p "$profile"
  nohup "$CHROME_PATH" --no-sandbox --no-first-run --no-default-browser-check --window-size=1280,800 \
    --remote-debugging-port="$port" --user-data-dir="$profile" about:blank > "$profile.log" 2>&1 &
  for _ in $(seq 50); do curl -fs "http://127.0.0.1:$port/json/version" > /dev/null && break; sleep 0.2; done
  curl -fs "http://127.0.0.1:$port/json/version" > /dev/null || { echo "::error title=Browser::the $side browser didn't answer on $port"; cat "$profile.log"; exit 1; }
  port=$((port + 1))
done
"$RUNNER_TEMP/bin/playwright-cli" --version
