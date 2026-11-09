module.exports = {
  branches: ['main'],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", {
      "changelogFile": "CHANGELOG.md",
    }],
    ["@semantic-release/exec", {
      // Pins every action of this repository that the workflows use to the version being released,
      // and fails the release unless every such reference in each file was rewritten.
      "prepareCmd": "perl -pi -e 's/(adobe\\/helix-shared-workflows\\/\\.github\\/actions\\/[\\w-]+@)\\S+/$1v${nextRelease.version}/g' .github/workflows/lambda.yaml .github/workflows/ai-review.yml && for f in .github/workflows/lambda.yaml .github/workflows/ai-review.yml; do N=$(grep -c 'adobe/helix-shared-workflows/.github/actions/' $f); M=$(grep -c 'adobe/helix-shared-workflows/.github/actions/[a-z-]*@v${nextRelease.version}' $f); test $N -gt 0 && test $N = $M || exit 1; done",
      "successCmd": "git tag -f v${nextRelease.version.split('.')[0]} ${nextRelease.gitTag} && git -c http.https://github.com/.extraheader=\"AUTHORIZATION: basic $(printf 'x-access-token:%s' \"$GITHUB_TOKEN\" | base64 | tr -d '\\n')\" push --force https://github.com/adobe/helix-shared-workflows.git refs/tags/v${nextRelease.version.split('.')[0]}:refs/tags/v${nextRelease.version.split('.')[0]}",
    }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", ".github/workflows/lambda.yaml", ".github/workflows/ai-review.yml"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    ["@semantic-release/github", {}],
  ],
};
