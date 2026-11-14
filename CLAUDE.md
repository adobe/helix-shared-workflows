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
  Bedrock); documented in `docs/ai-review.md`, not in README.md's input tables.
- `.github/ai-review/` — the review's scripts (`*.mjs`, `*.sh`), its prompt (`prompt.md`, rendered by
  `prompt.mjs`) and the findings schema (`findings-schema.json`). Every job of `ai-review.yml` checks this
  directory out from `${{ job.workflow_repository }}` at `${{ job.workflow_sha }}` (the commit of the workflow
  the caller runs), exports it as `AI_REVIEW`, and calls `node "$AI_REVIEW/…"` or `bash "$AI_REVIEW/…"`.
  Scripts get their inputs from the step's `env:`. No ref to rewrite (see the release model below).
- `.github/actionlint.yaml` — ignores actionlint's unknown-property error for `job.workflow_repository` and
  `job.workflow_sha`, which actionlint 1.7.12 doesn't know yet. Drop it once actionlint does.
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
  `adobe/helix-shared-workflows/.github/actions/lambda-setup@v1`, the moving major tag. Releases rewrite no
  ref and must never change a workflow file: the release pushes with the built-in `GITHUB_TOKEN`, which may
  not push workflow changes (`refusing to allow a GitHub App to create or update workflow`), so a
  `prepareCmd` or a `@semantic-release/git` asset under `.github/workflows/` breaks every release. Never change
  this ref to `./` (that resolves against the *caller* repo, not this one) or to a branch name. A caller
  pinned to `@vX.Y.Z` still gets the latest `vX` `lambda-setup`, so a breaking change to `action.yml` is a
  breaking change of the major version.
- semantic-release pushes the release commit and the `vX.Y.Z` tag first; the GitHub release and the move of
  `vX` come last. If it fails in between, a re-run finds the tag and releases nothing. So the release job ends
  with `.github/release/repair.sh`, which runs whether semantic-release succeeded or not: it points every `vX`
  at the latest `vX.Y.Z` and creates the GitHub release of any version tag that has none, from its section of
  `CHANGELOG.md`. To complete a release that stopped half way, re-run the job; don't fix tags by hand.
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
- `shellcheck .github/ai-review/*.sh` and `node --check` on each `.github/ai-review/*.mjs` —
  CI runs both, since actionlint only sees inline `run:` scripts.
- `npm ci`
- `npm run semantic-release-dry` — needs `GITHUB_TOKEN` and `CI_BRANCH` set (CI exports `CI_BRANCH` from
  `github.ref_name`).
- There are no unit tests in this repo. Exercise behavioral changes to `lambda.yaml`/`action.yml` by pointing
  a real caller repo (e.g. helix-word2md) at your branch (`uses: adobe/helix-shared-workflows/.github/workflows/lambda.yaml@<branch>`).
  Remember the `lambda-setup` action ref inside `lambda.yaml` still points at `@v1` unless you temporarily
  point it at your branch too — revert any such temporary pin before merging. `ai-review.yml` needs no such pin:
  calling it `@<branch>` runs that branch's scripts.
