// post: publishes each agent's findings ($PWD/findings/findings-<agent>/findings.json) as a
// `review / <agent>` commit status, a sticky summary comment, line comments (or, where
// GitHub won't take one, a pull request comment) and issues in repositories of the same
// owner. It runs no code from the pull request; ISSUES_TOKEN, if given, is only for issues
// in other repositories.
import { readFile } from 'node:fs/promises';

const { GITHUB_API_URL: api, GITHUB_REPOSITORY: repo, GH_TOKEN, ISSUES_TOKEN, AGENTS, PR, SHA, RUN_URL } = process.env;
const call = async (method, path, body, token = GH_TOKEN) => {
  const res = await fetch(`${api}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const post = (path, body, token) => call('POST', path, body, token);
const pages = async (path, token) => {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = await call('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, undefined, token);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
};
const said = await pages(`repos/${repo}/issues/${PR}/comments`);
const inline = await pages(`repos/${repo}/pulls/${PR}/comments`);
const once = async (body, send) => {
  if (said.some((comment) => comment.body === body) || inline.some((comment) => comment.body === body)) return;
  await send();
};
let failed = false;
for (const agent of JSON.parse(AGENTS)) {
  const findings = await readFile(`findings/findings-${agent}/findings.json`, 'utf8').then(JSON.parse).catch(() => undefined);
  const shots = (text) => text.replace(/!\[([^\]]*)\]\((?:\.\/)?shots\/([^)\s]+)\)/g, (_, alt, name) =>
    `📷 _${alt || name}_ ([\`${name}\` in findings-${agent}](${RUN_URL}))`);
  if (findings) {
    findings.summary = shots(findings.summary);
    for (const comment of findings.comments) comment.body = shots(comment.body);
    for (const issue of findings.issues) issue.body = shots(issue.body);
  }
  const state = !findings ? 'error' : findings.verdict === 'approved' ? 'success' : 'failure';
  await post(`repos/${repo}/statuses/${SHA}`, {
    state,
    context: `review / ${agent}`,
    // commit statuses reject 4-byte characters (emoji), and slice() could split a pair
    description: Array.from(findings?.summary ?? 'no findings').filter((char) => char.codePointAt(0) <= 0xffff).slice(0, 140).join(''),
    target_url: RUN_URL,
  });
  if (!findings) continue;
  const marker = `<!-- ai-review:${agent} -->`;
  const summary = `${marker}\n**${agent}: ${findings.verdict}** on ${SHA.slice(0, 7)}\n\n${findings.summary}`;
  const sticky = said.find((comment) => comment.body.startsWith(marker));
  await (sticky ? call('PATCH', `repos/${repo}/issues/comments/${sticky.id}`, { body: summary }) : post(`repos/${repo}/issues/${PR}/comments`, { body: summary }));
  for (const { path, line, body } of findings.comments) {
    const text = `**${agent}:** ${body}`;
    const fallback = `**${agent}** on \`${path}:${line}\`: ${body}`;
    if (inline.some((comment) => comment.path === path && comment.body === text)) continue;
    await post(`repos/${repo}/pulls/${PR}/comments`, { commit_id: SHA, path, line, side: 'RIGHT', body: text })
      .catch(() => once(fallback, () => post(`repos/${repo}/issues/${PR}/comments`, { body: fallback })));
  }
  for (const issue of findings.issues) {
    if (issue.security !== false) {
      console.log(`kept ${issue.security === true ? 'a security finding' : 'an issue without a boolean security field'} out of the issue tracker (${agent})`);
      continue;
    }
    const target = issue.repo || repo;
    if (target.split('/')[0] !== repo.split('/')[0]) {
      console.log(`skipped an issue for ${target}, outside ${repo.split('/')[0]}: ${issue.title}`);
      continue;
    }
    const token = target === repo ? GH_TOKEN : ISSUES_TOKEN || GH_TOKEN;
    const open = await pages(`repos/${target}/issues?state=open`, token).catch(() => []);
    const same = open.find((existing) => existing.title.trim().toLowerCase() === issue.title.trim().toLowerCase());
    if (same) {
      console.log(`already open: ${same.html_url}`);
      continue;
    }
    await post(`repos/${target}/issues`, { title: issue.title, body: `${issue.body}\n\nFrom ${agent}'s review of ${repo}#${PR}.` }, token)
      .then((created) => console.log(created.html_url))
      .catch(async (error) => {
        console.error(error.message);
        if (target === repo) {
          failed = true;
          return;
        }
        const note = `**${agent}** wanted to open an issue in ${target} but couldn't (${ISSUES_TOKEN ? 'ISSUES_TOKEN was refused' : 'no ISSUES_TOKEN'}):\n\n### ${issue.title}\n\n${issue.body}`;
        await once(note, () => post(`repos/${repo}/issues/${PR}/comments`, { body: note }));
      });
  }
}
process.exit(failed ? 1 : 0);
