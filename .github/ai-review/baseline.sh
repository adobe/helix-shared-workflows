#!/usr/bin/env bash
# reviewer: starts the baseline model's server and puts ask-baseline on the PATH.
# Needs AWS_BEARER_TOKEN_BEDROCK, AWS_REGION and BASELINE_MODEL; see baseline-server.mjs.
set -eo pipefail
mkdir -p "$RUNNER_TEMP/review/baseline" "$RUNNER_TEMP/bin"
export BASELINE_PORT=${BASELINE_PORT:-8799}
export BASELINE_LOG="$RUNNER_TEMP/review/baseline/questions.jsonl"
nohup node "$AI_REVIEW/baseline-server.mjs" > "$RUNNER_TEMP/review/baseline/server.log" 2>&1 &
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:$BASELINE_PORT/health" > /dev/null 2>&1; then
    cp "$AI_REVIEW/ask-baseline.mjs" "$RUNNER_TEMP/bin/ask-baseline"
    chmod +x "$RUNNER_TEMP/bin/ask-baseline"
    echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"
    echo "BASELINE_PORT=$BASELINE_PORT" >> "$GITHUB_ENV"
    cat "$RUNNER_TEMP/review/baseline/server.log"
    exit 0
  fi
  sleep 0.2
done
echo "::error title=Baseline::the baseline model's server did not start"
cat "$RUNNER_TEMP/review/baseline/server.log"
exit 1
