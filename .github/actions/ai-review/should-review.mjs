// prepare: whether this event gets a review. Only pull_request does, and Renovate's
// pull requests only if their branch slug matches one of RENOVATE_GROUPS (globs).
// Prints review=true|false for $GITHUB_OUTPUT.
import { matchesGlob } from 'node:path';

const { EVENT, BRANCH = '', AUTHOR, SENDER, RENOVATE_GROUPS = '' } = process.env;
const slug = BRANCH.replace(/^renovate\//, '').replace(/^major-/, '');
const groups = RENOVATE_GROUPS.split('\n').map((group) => group.trim()).filter(Boolean);
const renovate = AUTHOR === 'renovate[bot]' && SENDER === 'renovate[bot]' && BRANCH.startsWith('renovate/');
const review = EVENT === 'pull_request' && (!renovate || groups.some((group) => matchesGlob(slug, group)));
console.log(`review=${review}`);
