# Helix Shared Workflows

Reusable GitHub Actions workflows for Project Helix services:

- [Lambda](#lambda) (`.github/workflows/lambda.yaml`, plus its composite setup action): builds, tests, releases and deploys Project Helix Lambda services.
- [AI Review](#ai-review) (`.github/workflows/ai-review.yml`): reviews pull requests with Claude and Codex on Amazon Bedrock.

`@v1` follows the latest 1.x release; pin `@vX.Y.Z` for an exact version.

## Lambda

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `mode` | `ci` | `'ci'` (test + test-deploy/release) or `'deploy'` (deploy to a target account) |
| `ref` | `''` | Tag or branch to check out (required in deploy mode) |
| `account-id` | `''` | Target AWS account ID for test-deploy and deploy (empty = prod account 118435662149; release always uses prod) |
| `region` | `''` | Target AWS region for test-deploy and deploy (empty = us-east-1; release always uses us-east-1) |
| `lambda-role` | required | Lambda execution role name, exported as `HLX_LAMBDA_ROLE` |
| `node-version` | `24.x` | Node.js version to use for setup-node |
| `lint` | `true` | Run `npm run lint` in the test job (ci mode) |
| `codecov` | `true` | Upload coverage via codecov in the test job (ci mode) |
| `release-dry-run` | `true` | Run semantic-release-dry in the test-deploy job |
| `unit-tests` | `false` | Also run the test job in deploy mode |
| `post-deploy-tests` | `false` | Run post-deploy integration tests in deploy mode |
| `pre-deploy-command` | `''` | Optional shell command to run right before deploying |
| `env-secrets` | `''` | Space-separated names of caller repo secrets to export as env vars |

## AI Review

`.github/workflows/ai-review.yml` is an opt-in, reusable pull request review. It runs your tests on the head and on the base, gives Claude and Codex (on Amazon Bedrock) both trees to debug in (optionally with a headed Chrome per tree and a test environment), and posts each agent's verdict as a `review / <agent>` status, a summary comment, line comments and follow-up issues.

```yaml
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
```

See [docs/ai-review.md](docs/ai-review.md) for the full example, the inputs, test environments, and its [scope, security and cost](docs/ai-review.md#scope-security-and-cost).
