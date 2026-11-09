// context: the pull request's comments and reviews, and the repository's issues and
// pull requests, as far as the API allows, to $RUNNER_TEMP/context/. What it couldn't
// get is listed in missing.txt (and warned about), so the reviewers know to ask gh.
import { writeFile } from 'node:fs/promises';

const { GITHUB_API_URL: api, GITHUB_REPOSITORY: repo, GH_TOKEN, PR, RUNNER_TEMP } = process.env;
const dir = `${RUNNER_TEMP}/context`;
const missing = [];

const get = async (path) => {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${api}/${path}`, { headers: { authorization: `Bearer ${GH_TOKEN}`, accept: 'application/vnd.github+json' } });
    if (res.ok) return res.json();
    if (attempt === 2) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
};

const pages = async (path, most) => {
  const items = [];
  for (let page = 1; page <= most; page += 1) {
    const batch = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
};

const save = async (name, what) => {
  try {
    await writeFile(`${dir}/${name}`, JSON.stringify(await what(), null, 2));
  } catch (error) {
    missing.push(`${name}: ${error.message}`);
  }
};

await save('comments.json', () => pages(`repos/${repo}/issues/${PR}/comments`, 3));
await save('reviews.json', () => pages(`repos/${repo}/pulls/${PR}/reviews`, 3));
await save('review-comments.json', () => pages(`repos/${repo}/pulls/${PR}/comments`, 3));
let all;
await save('issues.json', async () => {
  all = await pages(`repos/${repo}/issues?state=all&sort=updated`, 5);
  return all.filter((item) => !item.pull_request).map(({ number, title, state, body, labels, created_at, closed_at }) => ({ number, title, state, body, labels: labels.map((label) => label.name), created_at, closed_at }));
});
await save('pulls.json', async () => {
  if (!all) throw new Error('the issues listing it comes from failed');
  return all.filter((item) => item.pull_request).map(({ number, title, state, body, pull_request }) => ({ number, title, state, body, merged_at: pull_request.merged_at }));
});
await writeFile(`${dir}/missing.txt`, missing.join('\n'));
for (const line of missing) console.log(`::warning title=Review context::${line}`);
