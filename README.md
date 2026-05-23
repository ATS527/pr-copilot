# Pull Request Review for VS Code

Pull Request Review is a VS Code extension that brings pull request review into the IDE with native code navigation, local branch checkout, and direct support for GitHub and GitLab.

## What It Does

- lists open pull requests and merge requests from the current repository
- checks out the selected branch locally
- opens native diffs for changed files
- lets you inspect issues, checks, security findings, and review drafts in side panels
- supports GitHub, GitHub Enterprise, GitLab, and self-hosted instances with custom domains

## Core Workflow

1. Open a repository folder in VS Code.
2. Run `Open PR`.
3. Select a pull request or merge request.
4. Review the changed files in native diffs.
5. Add review comments, inspect metadata, and submit the review when ready.
6. Restore the previous branch after review if needed.

## Configuration

- `prCopilot.provider`: choose `github` or `gitlab`
- `prCopilot.github.requireToken`: require a GitHub token before fetching pull requests
- `prCopilot.github.pullRequestQuery`: optional GitHub search filter

## Tokens

The extension stores GitHub and GitLab tokens securely in VS Code secret storage when you enter them through the commands in the sidebar.

## Development

```bash
npm install
npm run build
npm run lint
```

## Notes

- The extension is local-first and uses your checked-out workspace for code navigation.
- Custom domain GitHub Enterprise and GitLab instances are supported through repository remote parsing.
