// prepare: whether this event gets a review, and whether it is a strict one.
// - pull_request: reviewed, except Renovate's pull requests whose branch slug matches
//   none of RENOVATE_GROUPS (globs).
// - pull_request_target: runs with the base repository's secrets, so it is reviewed only
//   for a pull request from a fork and only if the caller set review-forks. That review
//   is strict: nothing from the fork is installed or run, and the reviewers can only read.
// Prints review=true|false and strict=true|false for $GITHUB_OUTPUT.
import { matchesGlob } from 'node:path';

const {
  EVENT, BRANCH = '', AUTHOR, SENDER, RENOVATE_GROUPS = '', FORK = 'false', REVIEW_FORKS = 'false',
} = process.env;
const slug = BRANCH.replace(/^renovate\//, '').replace(/^major-/, '');
const groups = RENOVATE_GROUPS.split('\n').map((group) => group.trim()).filter(Boolean);
const renovate = AUTHOR === 'renovate[bot]' && SENDER === 'renovate[bot]' && BRANCH.startsWith('renovate/');
const strict = EVENT === 'pull_request_target' && FORK === 'true' && REVIEW_FORKS === 'true';
const review = strict || (EVENT === 'pull_request' && (!renovate || groups.some((group) => matchesGlob(slug, group))));
console.log(`review=${review}`);
console.log(`strict=${strict}`);
