#!/usr/bin/env bash
# release: brings the tags and GitHub releases in line with the version tags, after
# semantic-release has run, whether it succeeded or not.
#
# semantic-release pushes the release commit and the vX.Y.Z tag first, and creates the
# GitHub release and moves the major tag (vX, which callers pin) last. If it fails in
# between, the version is tagged but callers on vX never get it, and a re-run doesn't
# help: semantic-release sees the tag and has nothing to release. This script does the
# two late steps for whatever is missing, so a re-run of the job completes the release.
#
#   repair.sh            moves the major tags and creates the missing releases
#   repair.sh --dry-run  only says what it would do
#
# Needs GH_TOKEN (contents: write) and a clone with all tags. REPO defaults to
# $GITHUB_REPOSITORY.
set -eo pipefail
dry_run=false
if [ "${1:-}" = --dry-run ]; then dry_run=true; fi
repo=${REPO:-$GITHUB_REPOSITORY}

push_tag() {
  git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')" \
    push --force "https://github.com/$repo.git" "refs/tags/$1:refs/tags/$1"
}

# The notes of a version: its section of CHANGELOG.md, without the heading.
notes() {
  awk -v version="${1#v}" '
    /^#+ \[?[0-9]+\.[0-9]+\.[0-9]+/ { printing = (index($0, "[" version "]") > 0 || $2 == version) ; next }
    printing { print }
  ' CHANGELOG.md
}

repaired=0
versions=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)

# every major tag points at the latest version of that major
while IFS= read -r major; do
  [ -n "$major" ] || continue
  latest=$(grep -E "^v$major\." <<< "$versions" | head -1)
  want=$(git rev-parse "$latest^{commit}")
  have=$(git rev-parse --verify --quiet "v$major^{commit}" || true)
  if [ "$have" = "$want" ]; then continue; fi
  repaired=$((repaired + 1))
  echo "v$major is at ${have:-nothing}, $latest is $want"
  if [ "$dry_run" = true ]; then echo "would move v$major to $latest"; continue; fi
  git tag -f "v$major" "$latest"
  push_tag "v$major"
  echo "::notice title=Release::moved v$major to $latest"
done < <(sed -E 's/^v([0-9]+)\..*/\1/' <<< "$versions" | sort -un)

# every version tag has a GitHub release
released=$(gh release list --repo "$repo" --limit 1000 --json tagName --jq '.[].tagName')
for tag in $versions; do
  if grep -qxF "$tag" <<< "$released"; then continue; fi
  repaired=$((repaired + 1))
  echo "$tag has no GitHub release"
  if [ "$dry_run" = true ]; then echo "would create the release $tag"; continue; fi
  notes "$tag" > "${RUNNER_TEMP:-/tmp}/notes-$tag.md"
  gh release create "$tag" --repo "$repo" --title "$tag" --notes-file "${RUNNER_TEMP:-/tmp}/notes-$tag.md" --verify-tag
  echo "::notice title=Release::created the GitHub release $tag"
done

if [ "$repaired" -eq 0 ]; then echo "tags and releases are in line: nothing to repair"; fi
