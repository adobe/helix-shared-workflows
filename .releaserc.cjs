module.exports = {
  branches: ['main'],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", {
      "changelogFile": "CHANGELOG.md",
    }],
    ["@semantic-release/exec", {
      "prepareCmd": "perl -pi -e 's/(adobe\\/helix-shared-workflows\\/\\.github\\/actions\\/lambda-setup@)\\S+/$1v${nextRelease.version}/g' .github/workflows/lambda.yaml && N=$(grep -c lambda-setup@ .github/workflows/lambda.yaml) && M=$(grep -c lambda-setup@v${nextRelease.version} .github/workflows/lambda.yaml) && test $N -gt 0 && test $N = $M",
      "successCmd": "git tag -f v${nextRelease.version.split('.')[0]} ${nextRelease.gitTag} && git -c http.https://github.com/.extraheader=\"AUTHORIZATION: basic $(printf 'x-access-token:%s' \"$GITHUB_TOKEN\" | base64 | tr -d '\\n')\" push --force https://github.com/adobe/helix-shared-workflows.git refs/tags/v${nextRelease.version.split('.')[0]}:refs/tags/v${nextRelease.version.split('.')[0]}",
    }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", ".github/workflows/lambda.yaml"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    ["@semantic-release/github", {}],
  ],
};
