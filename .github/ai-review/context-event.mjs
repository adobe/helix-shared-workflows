// context: the pull request as the event describes it, to $RUNNER_TEMP/context/pr.json.
import { readFileSync, writeFileSync } from 'node:fs';

const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const out = {
  number: pr.number,
  title: pr.title,
  body: pr.body,
  author: pr.user.login,
  labels: pr.labels.map((label) => label.name),
  draft: pr.draft,
  base: pr.base.ref,
  head: pr.head.ref,
};
writeFileSync(`${process.env.RUNNER_TEMP}/context/pr.json`, JSON.stringify(out, null, 2));
