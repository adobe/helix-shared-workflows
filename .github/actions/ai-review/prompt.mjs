// reviewer: renders prompt.md into $RUNNER_TEMP/review/prompt.txt. {{MORE}} becomes a
// list of what this run has beyond the two trees and the context: the test results, the
// browsers, the test environments and the deployments, as far as there are any.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  RUNNER_TEMP: T, REPO, PR, SETUP, TEST, TESTS, BROWSERS, ENVIRONMENT, STAGING_URL, BASE_URL, EXTRA, SHOTS, DISPLAY,
} = process.env;

mkdirSync(`${T}/review/shots`, { recursive: true });
const read = (file) => (existsSync(file) ? readFileSync(file) : undefined);

const more = [];
if (TESTS === 'success') {
  more.push(`${T}/review/tests/head/ and ${T}/review/tests/base/: "${TEST}" run on each tree before this review: setup.log, test.log, setup-exit-code, test-exit-code, and the report files it left (JUnit, coverage) under files/. Compare them: a test that passes on the base and fails on the head is a regression; one that fails on both is not caused by this change.`);
}
if (TEST) {
  more.push(`You can re-run the tests, or a single test, in either tree yourself; the full command is "${TEST}".`);
}
if (BROWSERS) {
  more.push(`Two headed Chrome for Testing instances run on the virtual display ${DISPLAY} with CDP enabled: the head's on http://127.0.0.1:9301 and the base's on http://127.0.0.1:9302. CHROME_PATH points at the browser. Drive them with playwright-cli (snapshot, click, fill, eval, console, requests, screenshot; run playwright-cli --help), always naming the browser, e.g. playwright-cli --cdp=http://127.0.0.1:9301 goto <url>; curlwright makes HTTP requests through a browser the same way. Compare what the head shows with what the base shows.`);
}
if (read(`${T}/review/environments.json`)?.toString().includes('"url":"http')) {
  more.push(`${T}/review/environments.json: the test environment the repository's hook ("${ENVIRONMENT}") brought up in each tree: its URL, whether it answered, the browser it was opened in, and the directory with its logs (hook.log, and notes.md with anything the repository wants you to know, if present). Its processes keep running for this review; the head's uses port 8801 and the base's 8802.`);
  for (const side of ['head', 'base']) {
    const notes = `${T}/review/env/${side}/notes.md`;
    if (existsSync(notes) && statSync(notes).size > 0) {
      more.push(`Notes from the ${side} environment's hook: ${read(notes).subarray(0, 4000).toString().replace(/\n+$/, '')}`);
    }
  }
}
if (STAGING_URL) more.push(`The head of the pull request is deployed at ${STAGING_URL}.`);
if (BASE_URL) more.push(`The base is deployed at ${BASE_URL}, to compare with.`);

const values = {
  PR, REPO, SETUP, T, SHOTS, EXTRA, MORE: more.map((line) => `\n- ${line}`).join(''),
};
const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prompt.md'), 'utf8');
const prompt = template.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '');
writeFileSync(`${T}/review/prompt.txt`, prompt);
console.log(prompt);
