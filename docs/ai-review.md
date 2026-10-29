# AI Review

`.github/workflows/ai-review.yml` is a reusable workflow that reviews pull requests with Claude and Codex, both on Amazon Bedrock. It is adapted from the review jobs of [ai-ecoverse/slicc-shared-web's pipeline](https://github.com/ai-ecoverse/slicc-shared-web/blob/main/.github/workflows/pipeline.yml), without the slicc browser harness.

What sets it apart from a plain `claude-code-action` review:

- **The reviewers read the test results.** The `tests` job runs your test command on the pull request's head and on its base, and gives the reviewers both logs, the exit codes and the report files (JUnit, coverage), so they can tell a regression from a test that already failed.
- **The reviewers work in a debuggable environment.** Both trees are checked out with dependencies installed, so a reviewer can re-run a single test and diff behaviour between head and base. With `browsers: true`, each tree gets its own headed Chrome for Testing on a virtual display with CDP enabled (head on `127.0.0.1:9301`, base on `9302`), driven by [slicc-cdp](https://github.com/ai-ecoverse/slicc-cdp)'s `playwright-cli` and `curlwright`.
- **Test environments.** The `environment` hook brings up whatever the repository needs in each tree (a dev server, fixtures, a local Worker), and the workflow opens it in that tree's browser, so a reviewer can compare the running head with the running base.
- **Structured verdicts.** Each agent answers with JSON (verdict, summary, line comments, follow-up issues). `post` turns that into a `review / <agent>` status, a sticky summary comment, line comments and issues; the `review` job fails unless every agent approved.

## Usage

```yaml
# .github/workflows/ai-review.yml
name: AI Review

on:
  pull_request:

concurrency:
  group: ai-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  ai-review:
    uses: adobe/helix-shared-workflows/.github/workflows/ai-review.yml@v1
    secrets:
      AWS_BEARER_TOKEN_BEDROCK: ${{ secrets.AWS_BEARER_TOKEN_BEDROCK }}
    permissions:
      contents: read
      issues: write
      pull-requests: write
      statuses: write
    with:
      test: npm test
```

The calling repository needs an `AWS_BEARER_TOKEN_BEDROCK` secret: a Bedrock API key with access to the models below. Pull requests from forks get no secrets, so they aren't reviewed; the `review` check warns instead of failing.

`@v1` follows the latest 1.x release of this repository; pin `@vX.Y.Z` for an exact version.

## Scope, security and cost

### Scope

- **Opt-in per repository.** Nothing runs unless a repository adds a caller workflow like the one above. Repositories that don't call it see no change.
- **Only `pull_request`.** The agents run only for the `pull_request` event, never for `pull_request_target`, `push` or anything else (the `prepare` job checks `github.event_name`). If the caller also runs on `merge_group`, the `review` check passes there without a new review, because the pull request was already reviewed.
- **Renovate is skipped by default.** Pull requests opened by Renovate aren't reviewed unless their branch matches a `review-renovate` glob.

### Security

- **Forks get no secrets, so they aren't reviewed.** GitHub doesn't pass secrets to `pull_request` runs from forks, so the reviewer jobs are skipped and the `review` check warns instead of failing. A maintainer can push the change to a branch in the repository to have it reviewed.
- **Read-only jobs.** `context` and `reviewer` get `contents`, `issues` and `pull-requests` read only, `tests` gets `contents: read` only, and `prepare` and `review` inherit the workflow's `contents: read`. Every checkout uses `persist-credentials: false`, so no token is left in `.git/config` for the code under review to find.
- **Only `post` writes.** It's the one job with `issues`, `pull-requests` and `statuses` write. It runs no code from the pull request: it downloads the agents' JSON findings and turns them into comments, commit statuses and issues. Issues go only to repositories of the same owner.
- **Two secrets, passed by name.** The workflow declares only `AWS_BEARER_TOKEN_BEDROCK` and the optional `ISSUES_TOKEN`, and a reusable workflow only gets the secrets its caller passes. Pass them explicitly, as in the example, not with `secrets: inherit`, so the caller's file shows exactly what goes in; no other repository secret reaches these jobs. `ISSUES_TOKEN` is used only in `post`, never by the reviewers.
- **Security findings stay out of the issue tracker.** An issue the agents mark `security: true` (or without a boolean `security`) is never filed; the prompt tells them to put security findings in the review summary or a line comment instead.

**Residual risk.** The reviewers run code from the pull request (`setup`, the tests, the `environment` hook, and whatever the agent decides to run), and the Bedrock key is in their environment. A malicious same-repository pull request could try to exfiltrate the key. Text the agents read (the diff, pull request comments, issues) could likewise try to steer them into leaking it. Mitigations:

- Use a dedicated Bedrock API key for the review, not one shared with other workloads, with limited model access, a spend limit and an [AWS Budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) alert. Rotate it regularly, and right away if you suspect a leak.
- Opening a same-repository pull request already needs write access to the repository, and people with write access can already run code in its CI.
- The `review` check is only as strong as the agents. Treat it as a reviewer, not as a replacement for a human approval on protected branches.

### Cost

- **Per reviewed push:** two agent runs, Claude on Opus 5.5 (`global.anthropic.claude-opus-5-5`) and Codex on GPT-6.1 Sol (`global.openai.gpt-6.1-sol`), both billed by Bedrock per token. On top of that come standard GitHub-hosted runner minutes for `prepare`, `context`, `tests`, the two `reviewer` jobs, `post` and `review`.
- **We don't have a measured per-run figure yet.** Token use depends on the size of the change, the test output and how much the agents decide to run. To measure it, give the review its own key. A Bedrock API key belongs to an IAM user, so Cost Explorer can show its spend: filter by service Amazon Bedrock and group by IAM principal (or by a cost allocation tag on that user). Or read the `AWS/Bedrock` `InputTokenCount` and `OutputTokenCount` metrics per model in CloudWatch. Divide by the number of review runs in the Actions tab.
- **Levers:**
  - `agents`: run one reviewer, e.g. `agents: '["claude"]'`, so each push pays for one model instead of two.
  - `claude-model` and `codex-model`, or the `AI_REVIEW_CLAUDE_MODEL` and `AI_REVIEW_CODEX_MODEL` variables for a whole repository or organization: a cheaper model, e.g. Sonnet.
  - `review-renovate`: Renovate pull requests are skipped by default; list only the groups worth reviewing.
  - `concurrency` with `cancel-in-progress: true` in the caller, as in the example, cancels the review of a push that a newer push superseded.
  - `review-timeout-minutes` (default `60`) caps how long each reviewer runs.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `setup` | `npm ci` | Installs dependencies, in the head and in the base tree |
| `test` | `npm test` | Runs the tests in both trees; empty skips the `tests` job. `$REVIEW_RESULTS` is a directory for extra report files |
| `test-results` | `junit.xml`, `test-results.xml`, `coverage/lcov.info`, `coverage/coverage-summary.json`, `lcov.info` | Globs of report files to hand to the reviewers |
| `test-timeout-minutes` | `20` | Time limit for each test run |
| `browsers` | `false` | Installs Chrome for Testing (via slicc-cdp) and starts Xvfb. In the tests job `CHROME_PATH` points at it; the reviewers get one headed Chrome per tree with CDP enabled, plus `playwright-cli` and `curlwright` |
| `chrome` | – | Chrome for Testing version or milestone; empty is the current stable |
| `environment` | `npm run --if-present review:env` | Hook that brings up a test environment in each tree; see below |
| `environment-timeout-seconds` | `120` | How long to wait for each environment's URL to answer |
| `staging-url`, `base-url` | – | Where the head and the base are deployed, e.g. `https://${{ github.head_ref }}--<repo>--adobe.aem.page` |
| `review-prompt` | – | Repository-specific instructions appended to the prompt |
| `review-renovate` | – | Globs of Renovate branch slugs that still get reviewed; other Renovate pull requests are skipped |
| `agents` | `["claude","codex"]` | Which reviewers run |
| `claude-model` | `global.anthropic.claude-opus-5-5` | Also settable with the `AI_REVIEW_CLAUDE_MODEL` variable |
| `codex-model` | `global.openai.gpt-6.1-sol` | Also settable with the `AI_REVIEW_CODEX_MODEL` variable |
| `aws-region` | `us-west-2` | Also settable with the `AI_REVIEW_AWS_REGION` variable |
| `runs-on` | `ubuntu-latest` | Runner for every job |
| `node-version` | `24` | |
| `review-timeout-minutes` | `60` | |

## Test environments

The `environment` hook runs in each tree (head, then base) after setup, in the reviewer jobs. It gets:

| Variable | |
| --- | --- |
| `REVIEW_SIDE` | `head` or `base` |
| `REVIEW_PORT` | a free port for this tree: `8801` for the head, `8802` for the base |
| `REVIEW_CDP` | this tree's browser (`http://127.0.0.1:9301` or `:9302`), with `browsers: true` |
| `REVIEW_ENV_DIR` | a directory for its logs, shown to the reviewers |

It should start long-running processes in the background (`nohup … &`) and return. It can write the URL to open to `$REVIEW_ENV_DIR/url`: the workflow waits until it answers and opens it in the tree's browser. Whatever it writes to `$REVIEW_ENV_DIR/notes.md` (test accounts, fixtures, what to try) goes into the prompt.

The default runs the package's `review:env` script, so a repository can keep the hook in `package.json`. A script that only exists in the head doesn't run in the base, so while a pull request introduces it, pass the hook as the `environment` input instead. For example, a server with fake data:

```yaml
    with:
      browsers: true
      environment: |
        PORT=$REVIEW_PORT nohup node scripts/dev-server.mjs > "$REVIEW_ENV_DIR/server.log" 2>&1 &
        echo "http://localhost:$REVIEW_PORT/" > "$REVIEW_ENV_DIR/url"
```

## Test reports

Most runners can write JUnit next to their usual output:

- `node --test`: `npm test -- --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination="$REVIEW_RESULTS/junit.xml"`
- `@web/test-runner`: add `junitReporter()` from `@web/test-runner-junit-reporter` (writes `test-results.xml`)
- `mocha`: `mocha-multi-reporters` with `mocha-junit-reporter`
