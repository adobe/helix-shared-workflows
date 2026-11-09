#!/usr/bin/env bash
# review: the check a branch protection can require. Passes on merge_group (reviewed on
# the pull request), when there is no review, and for forks (no secrets); otherwise it
# passes only if every agent in AGENTS left findings with verdict "approved".
set -eo pipefail
if [ "$EVENT" = merge_group ]; then
  echo "merge queue: reviewed on the pull request"
  exit 0
fi
if [ "$REVIEW" != true ]; then
  echo "no review for this pull request"
  exit 0
fi
if [ "$BEDROCK" != true ]; then
  if [ "$FORK" = true ]; then
    echo "::warning title=Review::A pull request from a fork gets no secrets, so it isn't reviewed: a maintainer can open the change again from a branch in this repo"
    exit 0
  fi
  echo "::error title=Review::AWS_BEARER_TOKEN_BEDROCK isn't available to this repo: add it as a repository or organization secret, then re-run"
  exit 1
fi
failed=0
for agent in $(jq -r '.[]' <<< "$AGENTS"); do
  verdict=$(jq -r .verdict "findings/findings-$agent/findings.json" 2>/dev/null || true)
  echo "$agent: ${verdict:-no findings}"
  [ "$verdict" = approved ] || failed=1
done
exit "$failed"
