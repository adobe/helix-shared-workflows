#!/usr/bin/env bash
# reviewer: runs the ENVIRONMENT hook in each tree, waits up to WAIT seconds for the URL
# it wrote to answer, opens it in that tree's browser (with BROWSERS), and describes
# both in $RUNNER_TEMP/review/environments.json for the prompt.
set -eo pipefail
list=
for side in head base; do
  tree=$GITHUB_WORKSPACE port=8801 cdp=http://127.0.0.1:9301
  [ "$side" = head ] || { tree=$RUNNER_TEMP/base port=8802 cdp=http://127.0.0.1:9302; }
  [ -n "$BROWSERS" ] || cdp=
  dir=$RUNNER_TEMP/review/env/$side
  mkdir -p "$dir"
  code=0
  (cd "$tree" && REVIEW_SIDE=$side REVIEW_PORT=$port REVIEW_CDP=$cdp REVIEW_ENV_DIR=$dir \
    bash -eo pipefail -c "$ENVIRONMENT") > "$dir/hook.log" 2>&1 || code=$?
  echo "$code" > "$dir/hook-exit-code"
  url=
  [ -s "$dir/url" ] && url=$(head -1 "$dir/url")
  state=none
  if [ "$code" != 0 ]; then
    state="hook failed ($code)"
    echo "::warning title=Environment::the $side hook exited $code"
  elif [ -n "$url" ]; then
    state="not answering after ${WAIT}s"
    for _ in $(seq "$WAIT"); do
      curl -fsS -o /dev/null --max-time 5 "$url" && { state=up; break; }
      sleep 1
    done
    [ "$state" = up ] || echo "::warning title=Environment::$url ($side) didn't answer within ${WAIT}s"
    if [ "$state" = up ] && [ -n "$cdp" ]; then
      playwright-cli --cdp="$cdp" goto "$url" > "$dir/browser.log" 2>&1 || echo "::warning title=Environment::couldn't open $url in the $side browser"
    fi
  fi
  echo "::group::$side environment: $state"
  cat "$dir/hook.log"
  echo "::endgroup::"
  list="$list{\"side\":\"$side\",\"tree\":\"$tree\",\"url\":\"$url\",\"state\":\"$state\",\"cdp\":\"$cdp\",\"logs\":\"$dir\"},"
done
echo "[${list%,}]" | tee "$RUNNER_TEMP/review/environments.json"
