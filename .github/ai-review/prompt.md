Review pull request {{PR}} of {{REPO}}.

The working directory holds:
{{TREES}}
- {{T}}/review/context/: the pull request (pr.json, pr.diff, files.txt, commits.txt, comments.json, reviews.json, review-comments.json), the repository's issues (issues.json) and recent pull requests (pulls.json). missing.txt names any the GitHub API wouldn't give; read those with gh if you need them.{{MORE}}

Read the change, run what you need, and decide whether it should be merged.
Deny only for a problem you confirmed that users or operators are likely to hit: a security or secret exposure, data loss or corruption, a crash, a regression in a common path, or a behaviour change without a test.
A race or edge case that needs unlikely timing (a window of seconds, a person acting in the middle of a run) or a rare combination of events doesn't block: approve, describe the scenario in a comment, and add an issue if it's worth tracking.
Don't deny for a risk the base already has. On a pull request that has been reviewed before (reviews.json, comments.json), deny only for something new and at least as serious as what earlier rounds fixed; don't move from one narrow case to the next.
Answer with JSON that matches the schema you were given:
- verdict: "approved" or "denied".
- summary: a few sentences on the change and your verdict.
- comments: findings on lines the pull request adds or changes, with path relative to the repository root and the line number in the head.
- issues: problems worth tracking outside this pull request, each with repo as owner/name, a title, a body and security.
  Leave out any that {{T}}/review/context/issues.json already has open, even under another title.
  security is true for anything about a security or secret exposure, a guard bypass, or protected data reaching where it shouldn't, and false for everything else.
  Put a security finding in the summary or a line comment of this review, never as an issue: an issue with security true is never filed.
Screenshots: when a finding is about what a page shows, save a PNG to {{T}}/review/shots/ (a name of letters, digits, dots, dashes or underscores; at most {{SHOTS}} files) and mention it in the summary, a comment or an issue body as ![what it shows](shots/name.png). They're attached to the run's findings artifact.
{{STRICT}}
{{EXTRA}}
