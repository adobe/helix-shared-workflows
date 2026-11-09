#!/usr/bin/env bash
# tests: runs SETUP and then TEST in the head ($GITHUB_WORKSPACE) and in the base
# (checked out to ./base, moved to $RUNNER_TEMP/base), and collects the logs, exit
# codes and the report files matching RESULTS into $RUNNER_TEMP/tests/<side>/.
# A failing setup or test is a result for the reviewers, not a failure of this step.
set +e
shopt -s globstar nullglob
mv base "$RUNNER_TEMP/base"
for side in head base; do
  tree=$GITHUB_WORKSPACE
  [ "$side" = head ] || tree=$RUNNER_TEMP/base
  out=$RUNNER_TEMP/tests/$side
  mkdir -p "$out/files"
  (cd "$tree" && bash -eo pipefail -c "$SETUP") > "$out/setup.log" 2>&1
  echo $? > "$out/setup-exit-code"
  if [ "$(cat "$out/setup-exit-code")" = 0 ]; then
    (cd "$tree" && REVIEW_RESULTS="$out/files" timeout "${MINUTES}m" bash -o pipefail -c "$TEST") > "$out/test.log" 2>&1
    echo $? > "$out/test-exit-code"
  else
    echo "setup failed, see setup.log" > "$out/test-exit-code"
  fi
  (
    cd "$tree" || exit
    while IFS= read -r pattern; do
      [ -n "$pattern" ] || continue
      # shellcheck disable=SC2206
      matches=($pattern)
      for file in "${matches[@]}"; do
        [ -f "$file" ] || continue
        mkdir -p "$out/files/$(dirname "$file")"
        cp "$file" "$out/files/$file"
      done
    done <<< "$RESULTS"
  )
  echo "::group::$side: setup $(cat "$out/setup-exit-code"), tests $(cat "$out/test-exit-code")"
  tail -n 40 "$out/test.log" 2>/dev/null || tail -n 40 "$out/setup.log"
  echo "::endgroup::"
  echo "- **$side**: setup exit $(cat "$out/setup-exit-code"), tests exit $(cat "$out/test-exit-code")" >> "$GITHUB_STEP_SUMMARY"
done
exit 0
