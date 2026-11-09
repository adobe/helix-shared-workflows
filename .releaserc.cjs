module.exports = {
  branches: ['main'],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", {
      "changelogFile": "CHANGELOG.md",
    }],
    ["@semantic-release/exec", {
      "successCmd": "git tag -f v${nextRelease.version.split('.')[0]} ${nextRelease.gitTag} && git -c http.https://github.com/.extraheader=\"AUTHORIZATION: basic $(printf 'x-access-token:%s' \"$GITHUB_TOKEN\" | base64 | tr -d '\\n')\" push --force https://github.com/adobe/helix-shared-workflows.git refs/tags/v${nextRelease.version.split('.')[0]}:refs/tags/v${nextRelease.version.split('.')[0]}",
    }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    ["@semantic-release/github", {}],
  ],
};
