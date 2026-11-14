## [1.2.1](https://github.com/adobe/helix-shared-workflows/compare/v1.2.0...v1.2.1) (2026-11-14)


### Bug Fixes

* start a strict review in the base tree, so a fork's agent configuration is not loaded ([496fa7b](https://github.com/adobe/helix-shared-workflows/commit/496fa7b2692d60b8011f128549409474c60b81b2))

# [1.2.0](https://github.com/adobe/helix-shared-workflows/compare/v1.1.1...v1.2.0) (2026-11-14)


### Features

* review pull requests from forks, strictly, when the caller opts in ([edc095e](https://github.com/adobe/helix-shared-workflows/commit/edc095ecb2de100c6b6662fa31d3c7961a62a683))

## [1.1.1](https://github.com/adobe/helix-shared-workflows/compare/v1.1.0...v1.1.1) (2026-11-09)


### Bug Fixes

* let Chrome for Testing start its sandbox on Ubuntu 23.10 and later ([#5](https://github.com/adobe/helix-shared-workflows/issues/5)) ([b849e3c](https://github.com/adobe/helix-shared-workflows/commit/b849e3c17e6128e01e5465cf69ce43fb65db969f)), closes [adobe/helix-website#1142](https://github.com/adobe/helix-website/issues/1142)

# [1.1.0](https://github.com/adobe/helix-shared-workflows/compare/v1.0.0...v1.1.0) (2026-11-09)


### Bug Fixes

* load the AI review's scripts from job.workflow_sha, so the release doesn't rewrite ai-review.yml ([1afe720](https://github.com/adobe/helix-shared-workflows/commit/1afe72048e2eefc0902b4e0972f0b8260aa51fd1))
* pin lambda-setup to [@v1](https://github.com/v1), so releases don't rewrite lambda.yaml ([#4](https://github.com/adobe/helix-shared-workflows/issues/4)) ([5fef327](https://github.com/adobe/helix-shared-workflows/commit/5fef327a16ba663203acc2d17583665a95f52bfc))


### Features

* add reusable AI review workflow ([b0ba2b6](https://github.com/adobe/helix-shared-workflows/commit/b0ba2b661ebf580d88dab101bd149b0e603316f1))

# 1.0.0 (2026-10-16)


### Features

* add reusable lambda workflow and setup action ([cc6a2ba](https://github.com/adobe/helix-shared-workflows/commit/cc6a2ba1dda619034dac7a6b60853807c85d3b23))
