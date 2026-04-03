# PR Copilot for VS Code

PR Copilot is a VS Code extension that brings pull request review into the IDE, combining native code navigation with AI-powered review assistance such as PR summaries, risk detection, and test suggestions.

## Overview

### Problem

Developers reviewing pull requests in GitHub or GitLab often work in a browser diff experience that lacks full code navigation, full-file context, and efficient review tooling. This makes reviews slower, more manual, and more error-prone.

### Goal

Reduce PR review time and improve code quality by:

- enabling PR review directly inside VS Code
- checking out the PR branch locally for full IDE context
- using AI to summarize changes, surface risks, and suggest tests

## Objectives

- Enable an end-to-end PR review workflow inside VS Code
- Improve reviewer productivity and confidence
- Reduce missed bugs, regressions, and test gaps

## Success Metrics

- Average PR review time reduced by 30-50%
- Weekly active users
- AI suggestion acceptance or usage rate
- Qualitative improvement in review quality
- Increased reviewer coverage of edge cases and tests

## Target Users

### Primary

- Software engineers reviewing pull requests

### Secondary

- Tech leads and senior reviewers
- Teams working in medium to large codebases
- Engineering teams that already rely heavily on VS Code

## Product Vision

PR Copilot is not just an AI add-on for code review. It is a better review workflow: native IDE context, real code navigation, and AI assistance embedded directly where developers already work.

## Core MVP Features

### 1. PR Discovery and Selection

Users can view and select open pull requests from GitHub or GitLab directly in VS Code.

Requirements:

- Authenticate with GitHub and GitLab
- Fetch open PRs or merge requests for the connected repository
- Show PR title, author, branch, status, and updated time
- Allow the user to select a PR for review

Acceptance criteria:

- User can run `Open PR`
- User can view a list of available PRs
- Selecting a PR opens the review workflow

### 2. Branch Fetch and Checkout

The extension fetches and checks out the PR branch locally so the user reviews the actual code in the workspace.

Requirements:

- Fetch PR branch from remote
- Checkout PR branch into the local repository
- Detect current branch before switching
- Warn user if the working tree has uncommitted changes
- Offer a way to return to the previous branch after review

Acceptance criteria:

- User can fetch and checkout the PR branch from the extension
- Extension warns before switching if local changes exist
- User can restore the previous branch after review

### 3. Native Diff Viewer

Users can inspect the PR diff inside VS Code using native editor experiences.

Requirements:

- Show changed files in a file tree
- Open inline or side-by-side diffs
- Display added, modified, and deleted files
- Support navigation between changed files

Acceptance criteria:

- User can see all changed files in the PR
- Clicking a file opens the diff in the editor
- Diff experience feels native to VS Code

### 4. Full Code Navigation

Because the PR branch is checked out locally, users can navigate the codebase using standard IDE features.

Requirements:

- Go to definition
- Find references
- Open full file context
- Search across the codebase
- Navigate across modules and unchanged code

Acceptance criteria:

- User can use Go to Definition on symbols
- Navigation works in the checked-out codebase
- Reviewer can move from diff to full implementation context easily

### 5. AI PR Summary

Generate a concise summary of the pull request.

Requirements:

- Analyze changed files and diff content
- Produce a high-level summary
- Highlight key changes
- Identify impacted areas

Acceptance criteria:

- Summary appears within a few seconds for typical PRs
- Summary is shown at the top of the PR review view
- Summary is concise and useful for reviewer orientation

### 6. AI Risk Detection

Identify likely issues or risky changes in the PR.

Requirements:

- Analyze changes for breaking changes
- Flag null or edge case risks
- Detect missing validations and unhandled errors
- Surface performance concerns where relevant

Acceptance criteria:

- Risks are shown in a side panel or inline annotations
- Findings are anchored to files or lines where possible
- AI findings are clearly presented as suggestions, not facts

### 7. Test Case Generator

Generate test ideas based on the changed code.

Requirements:

- Analyze changed functions, classes, or logic branches
- Suggest happy path tests
- Suggest edge cases
- Suggest failure scenarios
- Allow copying suggestions for use in test files

Acceptance criteria:

- User can view test suggestions for the PR
- Suggestions are specific enough to be actionable
- User can copy test ideas directly

### 8. Basic Test Gap Analyzer

Highlight likely missing test coverage in the PR.

Requirements:

- Detect production code changes without corresponding test changes
- Flag new functions or branches that appear untested
- Show warnings for likely test gaps

Acceptance criteria:

- Extension surfaces likely missing test coverage areas
- User can identify where test additions may be needed

## Out of Scope for MVP

- CI/CD integration
- Team dashboards
- Multi-repo analytics
- Advanced static analysis engine
- Auto-posting review comments to GitHub or GitLab
- Organization-wide policy enforcement
- Backend-managed billing or team management

## MVP Product Decisions

### Local-First Architecture

The MVP will be built as a local-first VS Code extension.

Instead of building a backend immediately, the extension will:

- fetch pull request data directly from GitHub or GitLab
- checkout the PR branch locally
- rely on the checked-out workspace and existing language servers for navigation
- call the LLM directly using a user-provided API key

This reduces engineering complexity and gives the user a more reliable review experience in the first version.

### User-Provided LLM API Key

The extension will ask the user to provide their own LLM API key during setup.

Why:

- avoids building backend infrastructure for MVP
- lowers time to market
- reduces operational cost
- simplifies AI integration

Tradeoffs:

- user must bring their own API key
- billing is tied to the user’s account
- prompt versioning and usage tracking are more limited in MVP

## UX Flow

1. User opens VS Code in a repository.
2. User runs `Open PR`.
3. User selects a PR from GitHub or GitLab.
4. Extension prompts to fetch and checkout the PR branch.
5. User reviews changed files in native diff view.
6. User uses standard IDE navigation to inspect code deeply.
7. AI insights load in parallel:
   - summary
   - risks
   - test suggestions
8. User optionally restores the previous branch after review.

## Milestones

### Phase 1

- Extension scaffold
- GitHub auth
- PR list and selection
- Local branch fetch and checkout
- File tree and diff opening

### Phase 2

- GitLab support
- Previous branch restore
- Review session state
- Native navigation polish

### Phase 3

- AI summary
- AI risk detection
- Insights panel UI

### Phase 4

- Test suggestion generation
- Basic test gap analysis
- Caching and performance improvements

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| User workspace has uncommitted changes | Warn before checkout and allow cancel |
| AI hallucinations or low-confidence suggestions | Present AI output as advisory only |
| Large PRs cause slow analysis | Chunk diffs and load insights progressively |
| API rate limits | Local caching and request throttling |
| Repo or branch checkout fails | Show clear recovery steps and preserve previous branch |
| Forked PR branch fetch complexity | Support common fetch patterns first, expand later |
| User reluctance to provide API key | Explain local-only storage and BYO-key model clearly |

## Non-Functional Requirements

- Extension should remain responsive during AI processing
- AI results should appear progressively where possible
- Secrets must be stored securely via VS Code secure storage
- PR reviews should degrade gracefully if AI fails
- PR reviews should degrade gracefully if git checkout fails
- PR reviews should degrade gracefully if the language server is unavailable

## MVP Definition of Done

The MVP is complete when a user can:

- connect GitHub and optionally GitLab
- provide an LLM API key securely
- select a PR inside VS Code
- fetch and checkout the PR branch locally
- browse changed files in native diff view
- use standard IDE navigation on the checked-out code
- view an AI-generated PR summary
- view AI risk suggestions
- view AI-generated test ideas
- restore their original branch after review

## Future Enhancements

- CI integration
- PR risk scoring
- One-click draft review comments
- Shared team settings
- Org-level prompt policies
- Backend-managed billing and usage
- Code ownership insights
- Reviewer memory and historical PR patterns

## Monetization

### Free Tier

- Limited PR analyses per month
- Core review workflow

### Paid Tier

- Unlimited AI usage
- Stronger models
- Team features
- Advanced review analytics
- Shared configuration and policies

## Positioning

PR Copilot for VS Code is a local-first AI-assisted code review extension that turns pull request review into a native IDE workflow. By combining branch checkout, real code navigation, and targeted AI assistance, it aims to make reviews faster, deeper, and more reliable.

## Review Sandbox

This repository may temporarily contain a dedicated review sandbox branch used to exercise PR Copilot against intentionally flawed but non-malicious sample changes. Those changes are for testing review flows only and should not be merged into production code.
