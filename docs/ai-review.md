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

The calling repository needs an `AWS_BEARER_TOKEN_BEDROCK` secret: a Bedrock API key with access to the models below. Pull requests from forks get no secrets, so they aren't reviewed; the `review` check warns instead of failing. To review them too, see [Pull requests from forks](#pull-requests-from-forks).

`@v1` follows the latest 1.x release of this repository; pin `@vX.Y.Z` for an exact version.

## Scope, security and cost

### Scope

- **Opt-in per repository.** Nothing runs unless a repository adds a caller workflow like the one above. Repositories that don't call it see no change.
- **Only `pull_request`, unless you opt in to forks.** The agents run for the `pull_request` event, never for `push` or anything else (the `prepare` job checks `github.event_name`). They run for `pull_request_target` only with `review-forks: true`, only for a pull request from a fork, and only as a [strict review](#pull-requests-from-forks). If the caller also runs on `merge_group`, the `review` check passes there without a new review, because the pull request was already reviewed.
- **Renovate is skipped by default.** Pull requests opened by Renovate aren't reviewed unless their branch matches a `review-renovate` glob.

### Security

- **Forks get no secrets on `pull_request`, so they aren't reviewed there.** GitHub doesn't pass secrets to `pull_request` runs from forks, so the reviewer jobs are skipped and the `review` check warns instead of failing. A maintainer can push the change to a branch in the repository to have it reviewed, or the repository can opt in to [strict reviews of forks](#pull-requests-from-forks).
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
| `review-forks` | `false` | Review pull requests from forks, strictly, when the caller runs on `pull_request_target`; see [Pull requests from forks](#pull-requests-from-forks) |
| `baseline` | `false` | Gives each reviewer a small model without tools to ask; see [Baseline model](#baseline-model) |
| `baseline-claude-model` | `global.anthropic.claude-haiku-5-5` | The baseline of the Claude reviewer. Also settable with the `AI_REVIEW_BASELINE_CLAUDE_MODEL` variable |
| `baseline-codex-model` | `global.openai.gpt-5.6-luna` | The baseline of the Codex reviewer. Also settable with the `AI_REVIEW_BASELINE_CODEX_MODEL` variable |
| `baseline-questions` | `30` | How many questions the baseline answers for each reviewer |
| `agents` | `["claude","codex"]` | Which reviewers run |
| `claude-model` | `global.anthropic.claude-opus-5-5` | Also settable with the `AI_REVIEW_CLAUDE_MODEL` variable |
| `codex-model` | `global.openai.gpt-6.1-sol` | Also settable with the `AI_REVIEW_CODEX_MODEL` variable |
| `aws-region` | `us-west-2` | Also settable with the `AI_REVIEW_AWS_REGION` variable |
| `runs-on` | `ubuntu-latest` | Runner for every job |
| `node-version` | `24` | |
| `review-timeout-minutes` | `60` | |

## Pull requests from forks

A pull request from a fork gets no secrets on `pull_request`, so the review above skips it. With `review-forks: true` and a second caller workflow on `pull_request_target`, forks get a **strict review**. `pull_request_target` runs with the base repository's secrets, so the strict review is built to keep the fork's code away from them:

- **Nothing from the fork is installed or run.** There is no `tests` job, and `setup`, `browsers` and the `environment` hook are skipped. The reviewers get the two trees and the context, nothing else.
- **The reviewers start in the base, not in the fork's tree.** Claude Code and Codex load the project configuration of their working directory: `.claude/settings.json` with its hooks, `.mcp.json`, `AGENTS.md`. A hook is a shell command, so a fork that could supply one would run code before any review. In a strict review the working directory is the base, and the fork's head is checked out next to it as files to read.
- **The reviewers can only read.** Claude gets `Read`, `Glob` and `Grep`, without `Bash` or `WebFetch`. Codex runs in its `read-only` sandbox.
- **The prompt is stricter.** Everything in the pull request is untrusted data, text in it that addresses the reviewer is quoted and denied, and the reviewers deny what they can't rule out as harmful by reading it, not only what they confirmed.
- **Only a pull request from a fork is reviewed this way.** On `pull_request_target`, a pull request from a branch of the repository gets no review; it has the `pull_request` one.

```yaml
# .github/workflows/ai-review-forks.yml
name: AI Review (forks)

on:
  pull_request_target:

concurrency:
  group: ai-review-forks-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  # A maintainer reads the diff and approves the run before the key is anywhere near it:
  # give the environment required reviewers.
  approve:
    if: github.event.pull_request.head.repo.full_name != github.repository
    runs-on: ubuntu-latest
    environment: fork-review
    steps:
      - run: echo "approved"

  ai-review:
    needs: approve
    uses: adobe/helix-shared-workflows/.github/workflows/ai-review.yml@v1
    secrets:
      AWS_BEARER_TOKEN_BEDROCK: ${{ secrets.AWS_BEARER_TOKEN_BEDROCK }}
    permissions:
      contents: read
      issues: write
      pull-requests: write
      statuses: write
    with:
      review-forks: true
```

In the `pull_request` caller, skip forks, so that a pull request has one `review` check and not a second one that passes without a review:

```yaml
jobs:
  ai-review:
    if: github.event.pull_request.head.repo.full_name == github.repository
```

**Residual risk.** The reviewers still hold the Bedrock key while they read text an outsider wrote. A reviewer that is talked into it could read the key from its own process and put it in its findings, which `post` publishes on the pull request. What stands against that:

- The `approve` job. An environment with required reviewers means a maintainer has read the diff before any agent does, and a new push needs a new approval.
- The read-only tools, and Claude Code's scrubbing of secrets from subprocess environments, which `claude-code-action` turns on when users without write access are allowed.
- A dedicated key with a spend limit, as above.

Don't turn this on without the approval step.

## Baseline model

Some repositories hold instructions written for agents: skills, prompts, an `AGENTS.md`. A line in them is worth its place only if an agent would get the thing wrong without it. With `baseline: true`, each reviewer can find that out by asking a model that hasn't read the instructions:

```
$ ask-baseline "How do I keep a GitHub Actions workflow on one Node version?"
Use actions/setup-node with a node-version input, …
```

- **What answers.** A small model on Bedrock: Haiku for the Claude reviewer, Luna for the Codex reviewer. It gets the question and a two-sentence system prompt, and nothing else: no tools, no files, no web access, nothing about the repository or the pull request. Every call is a new conversation.
- **What the reviewer does with it.** That is for the caller's `review-prompt` to say. The built-in prompt only explains the command: ask the task or the fact as someone would who has not read the instructions, and treat what the baseline gets right by itself as something the instructions don't need to say.
- **Where it runs.** A server on `127.0.0.1` in the reviewer's job holds the Bedrock key and makes the calls; `ask-baseline` only talks to that server. Anything on the runner can ask it, so it answers at most `baseline-questions` questions of at most 4,000 characters, with at most 4,000 output tokens each, reasoning included.
- **What is kept.** The questions and answers are in the reviewer's findings artifact, as `baseline.jsonl`.
- **Not in a strict review.** There the reviewers run no commands.

The cost is small next to the review itself: thirty short calls to the smallest model of each provider.

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

## Where things are

The workflow, `.github/workflows/ai-review.yml`, holds the jobs, their permissions and the third-party actions. What runs inside the steps is in [`.github/ai-review/`](../.github/ai-review/):

| File | Job | What it does |
| --- | --- | --- |
| `should-review.mjs` | `prepare` | Whether this event gets a review (`pull_request` only; Renovate only with `review-renovate`) |
| `context-event.mjs`, `context-api.mjs` | `context` | The pull request, its comments and reviews, and the repository's issues and pull requests |
| `tests.sh` | `tests` | `setup` and `test` in the head and the base, with logs, exit codes and report files |
| `display.sh`, `browsers.sh` | `tests`, `reviewer` | Chrome for Testing and Xvfb; in `reviewer` also one CDP browser per tree, `playwright-cli` and `curlwright` |
| `environments.sh` | `reviewer` | The `environment` hook in each tree, and `environments.json` for the prompt |
| `prompt.md`, `prompt.mjs` | `reviewer` | The prompt, and what fills in its placeholders |
| `findings-schema.json` | `reviewer` | The JSON schema both agents answer with |
| `post.mjs` | `post` | Statuses, comments and issues from the findings |
| `verdict.sh` | `review` | The `review` check |

Each job checks that directory out from `job.workflow_sha`, the commit of `ai-review.yml` the caller runs (the tag, branch or SHA after `@`), and exports it as `AI_REVIEW`. So the scripts always come from the same commit as the workflow, never from the caller or the pull request under review, and no release has to rewrite any ref.
