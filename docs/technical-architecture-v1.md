# Technical Architecture

Archived note: this document captured an earlier prototype design and is kept only as historical context.

The current extension is a local-first PR review tool for VS Code. It focuses on:

- loading pull requests and merge requests from GitHub and GitLab
- checking out the selected branch locally
- opening native diffs in the editor
- showing issues, checks, security findings, and review drafts in VS Code views
- supporting GitHub Enterprise and self-hosted GitLab instances via custom repository remotes
