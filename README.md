# Helix Shared Workflows

A reusable GitHub Actions workflow (plus its composite setup action) that builds, tests, releases and deploys Project Helix Lambda services.

## Usage

```yaml
name: Build
on: [push]

permissions:
  id-token: write
  contents: write
  issues: read
  pull-requests: write

jobs:
  ci:
    uses: adobe/helix-shared-workflows/.github/workflows/lambda.yaml@v1
    with:
    secrets: inherit
```

`@v1` follows the latest 1.x release; pin `@vX.Y.Z` for an exact version.

## Inputs

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
