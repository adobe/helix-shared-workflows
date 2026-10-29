# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Shared, reusable GitHub Actions tooling for Project Helix Lambda services. Service repos consume it as
`adobe/helix-shared-workflows/.github/workflows/lambda.yaml@v1` with `secrets: inherit`. Layout:

- `.github/workflows/lambda.yaml` — the reusable `workflow_call` workflow (`test`, `test-deploy`, `release`,
  `deploy` jobs).
- `.github/actions/lambda-setup/action.yml` — composite action used by every job in `lambda.yaml` for
  checkout/Node/`npm ci`, and (when `aws-account-id` is set) AWS login, secrets, and the pre-deploy hook.
- `.github/workflows/ai-review.yml` — the reusable `workflow_call` AI pull request review (Claude + Codex on
  Bedrock); documented in `docs/ai-review.md`, not in README.md's input tables. It uses no action from this
  repo, so the release `prepareCmd` doesn't touch it.
- `.github/workflows/main.yaml` — this repo's own CI/release workflow (not reused by callers).
- `.releaserc.cjs` — semantic-release config; drives the release described below.
- `CHANGELOG.md` — bot-managed by `@semantic-release/changelog`; created on first release, never hand-edited.

See README.md for the full input reference for `lambda.yaml` and `lambda-setup`.

## Release model — read before touching `lambda.yaml` or `action.yml`

- One semantic-release version for the whole repo. Tags are `vX.Y.Z` plus a moving major tag `vX` that the
  release force-moves via `git tag -f` + `push --force` in the `successCmd` (`.releaserc.cjs`). Callers pin to
  `@v1`, so `vX` must always point at the latest compatible release.
- Version bump comes from Conventional Commits on `main`: `fix:` → patch, `feat:` → minor, `!` or
  `BREAKING CHANGE:` → major; `docs:`/`chore:`/`ci:` → no release. Pick the type deliberately — any change to
  `lambda.yaml` or `action.yml` that callers should actually receive must be `fix:` or `feat:`, not `chore:`.
- What counts as breaking for callers: removing/renaming a `workflow_call` or action input, changing an
  input's default or type, adding a new *required* input, changing the `permissions:` callers must grant,
  requiring a new secret or a new `package.json` script from callers, or changing job names/behavior callers
  rely on (e.g. which job deploys where).
- `.github/workflows/lambda.yaml` references `lambda-setup` as
  `adobe/helix-shared-workflows/.github/actions/lambda-setup@v1.0.0`. This ref is rewritten by the release
  `prepareCmd` (a `perl` regex keyed on the exact string
  `adobe/helix-shared-workflows/.github/actions/lambda-setup@`), which then verifies every occurrence was
  rewritten and fails the release otherwise. Never hand-edit these refs, never change them to `./` (that
  resolves against the *caller* repo, not this one) or to a branch name, and keep the full
  `adobe/helix-shared-workflows/.github/actions/lambda-setup@` prefix intact so the regex keeps matching.
- Never create or move tags by hand, never edit `CHANGELOG.md` directly, and never author
  `chore(release): ... [skip ci]` commits yourself — all of that is owned by semantic-release's
  `successCmd`/`@semantic-release/git` steps.

## Changing inputs

Keep `lambda.yaml`'s `workflow_call.inputs`, `action.yml`'s `inputs`, and the README.md input tables in sync
(names, types, defaults, descriptions). Prefer adding new inputs as optional with a backward-compatible
default over changing existing ones. Logic specific to one service belongs in the caller (via
`pre-deploy-command`, `env-secrets`, or extra jobs in the caller's own workflow), not as a new template input,
unless it's genuinely generic across services.

## Security notes (grounded in the current YAML)

- Untrusted/caller-controlled values are passed into `run:` steps via `env:` and then referenced as shell
  variables, never interpolated directly into the script with `${{ }}` — follow the existing pattern (e.g.
  the "Check lambda role" and "Export repo secrets" steps in `action.yml`).
- `env-secrets` names are resolved against `secrets-json` (`toJSON(secrets)` from the caller) with `jq` and
  written to `$GITHUB_ENV` using a per-secret random heredoc delimiter (`EOF_$(openssl rand -hex 8)`) to avoid
  premature termination on secret content — preserve that mechanism if you touch this step.
- `pre-deploy-command` is caller-supplied and runs as-is (`run: ${{ inputs.pre-deploy-command }}`); it is
  trusted input by design, scoped to the caller's own deploy.

## Validation

- `actionlint` — CI runs it via the pinned `docker://rhysd/actionlint:1.7.12` image (`main.yaml`); run the
  same image locally to lint `lambda.yaml`/`action.yml` before pushing.
- `npm ci`
- `npm run semantic-release-dry` — needs `GITHUB_TOKEN` and `CI_BRANCH` set (CI exports `CI_BRANCH` from
  `github.ref_name`).
- There are no unit tests in this repo. Exercise behavioral changes to `lambda.yaml`/`action.yml` by pointing
  a real caller repo (e.g. helix-word2md) at your branch (`uses: adobe/helix-shared-workflows/.github/workflows/lambda.yaml@<branch>`).
  Remember the `lambda-setup` action ref inside `lambda.yaml` still points at the last release unless you
  temporarily bump it too — revert any such temporary pin before merging.
