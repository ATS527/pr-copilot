import * as vscode from "vscode";
import { checkoutPr } from "./commands/checkoutPr";
import { openPr } from "./commands/openPr";
import { refreshReview } from "./commands/refreshReview";
import { restoreBranch } from "./commands/restoreBranch";
import type { PullRequestDetails, ReviewSession } from "./models/pr";
import { ChecksTreeProvider } from "./providers/checksTreeProvider";
import { IssuesTreeProvider } from "./providers/issuesTreeProvider";
import { PrTreeProvider } from "./providers/prTreeProvider";
import { ReviewDraftsProvider } from "./providers/reviewDraftsProvider";
import { SecurityTreeProvider } from "./providers/securityTreeProvider";
import { DiffService } from "./services/diffService";
import { GitService } from "./services/gitService";
import { GitHubService } from "./services/githubService";
import { GitLabService, type GitLabRepositoryRef } from "./services/gitlabService";
import { LoggerService } from "./services/loggerService";
import { SecretService } from "./services/secretService";
import { toWorkspaceFileUri } from "./utils/workspace";
import type { PullRequestReviewCommentDraft } from "./models/workflow";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const secretService = new SecretService(context);
  const githubService = new GitHubService();
  const gitlabService = new GitLabService();
  const gitService = new GitService();
  const diffService = new DiffService(gitService);
  const logger = new LoggerService();
  const prTreeProvider = new PrTreeProvider();
  const issuesProvider = new IssuesTreeProvider();
  const checksProvider = new ChecksTreeProvider();
  const securityProvider = new SecurityTreeProvider();
  const reviewDraftsProvider = new ReviewDraftsProvider();
  const reviewDraftDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightStrongBackground"),
    after: {
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
      margin: "0 0 0 1rem"
    }
  });

  let reviewSession: ReviewSession | undefined;
  let currentRepository:
    | { provider: "github"; host: string; owner: string; repo: string; apiBaseUrl: string }
    | ({ provider: "gitlab" } & GitLabRepositoryRef)
    | undefined;
  let pendingReviewComments: PullRequestReviewCommentDraft[] = [];

  function getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("prCopilot");
  }

  async function refreshWorkflowData(): Promise<void> {
    if (!currentRepository) {
      issuesProvider.setIssues([]);
      checksProvider.setChecks([]);
      securityProvider.setFindings([]);
      return;
    }

    if (currentRepository.provider === "github") {
      const token = await secretService.getGitHubToken();
      try {
        const issues = await githubService.listIssues(currentRepository, token);
        issuesProvider.setIssues(issues);
      } catch (error) {
        logger.error(`Failed to refresh issues: ${toErrorMessage(error)}`);
      }

      if (reviewSession?.pr?.headSha) {
        try {
          const checks = await githubService.listCheckRuns(currentRepository, reviewSession.pr.headSha, token);
          checksProvider.setChecks(checks);
        } catch (error) {
          logger.error(`Failed to refresh checks: ${toErrorMessage(error)}`);
        }
      } else {
        checksProvider.setChecks([]);
      }

      if (reviewSession?.pr) {
        try {
          const findings = await githubService.listSecurityFindings(currentRepository, reviewSession.pr.number, token);
          securityProvider.setFindings(findings);
        } catch (error) {
          logger.error(`Failed to refresh security findings: ${toErrorMessage(error)}`);
        }
      } else {
        securityProvider.setFindings([]);
      }
      return;
    }

    const token = await secretService.getGitLabToken();
    try {
      const issues = await gitlabService.listIssues(currentRepository, token);
      issuesProvider.setIssues(issues);
    } catch (error) {
      logger.error(`Failed to refresh GitLab issues: ${toErrorMessage(error)}`);
    }

    if (reviewSession?.pr) {
      try {
        const checks = await gitlabService.listCheckRuns(currentRepository, reviewSession.pr.number, token);
        checksProvider.setChecks(checks);
      } catch (error) {
        logger.error(`Failed to refresh GitLab pipelines: ${toErrorMessage(error)}`);
      }

      try {
        const findings = await gitlabService.listSecurityFindings(currentRepository, token);
        securityProvider.setFindings(findings);
      } catch (error) {
        logger.error(`Failed to refresh GitLab security findings: ${toErrorMessage(error)}`);
      }
    } else {
      checksProvider.setChecks([]);
      securityProvider.setFindings([]);
    }
  }

  function updateReviewDraftDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
      const drafts = pendingReviewComments.filter((draft) => draft.path === relativePath);
      const decorations = drafts.map((draft) => ({
        range: new vscode.Range(draft.line - 1, 0, draft.line - 1, 0),
        renderOptions: {
          after: {
            contentText: `PR draft: ${draft.body}`
          }
        },
        hoverMessage: `Pending review comment\n\n${draft.body}`
      }));
      editor.setDecorations(reviewDraftDecoration, decorations);
    }

    reviewDraftsProvider.setDrafts(pendingReviewComments);
  }

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("pr-copilot-base", diffService),
    vscode.workspace.registerTextDocumentContentProvider("pr-copilot-empty", diffService),
    vscode.window.registerTreeDataProvider("prCopilot.pullRequests", prTreeProvider),
    vscode.window.registerTreeDataProvider("prCopilot.issues", issuesProvider),
    vscode.window.registerTreeDataProvider("prCopilot.checks", checksProvider),
    vscode.window.registerTreeDataProvider("prCopilot.security", securityProvider),
    vscode.window.registerTreeDataProvider("prCopilot.reviewDrafts", reviewDraftsProvider),
    vscode.window.onDidChangeVisibleTextEditors(() => updateReviewDraftDecorations()),
    vscode.commands.registerCommand("prCopilot.openPr", async () => {
      try {
        const result = await openPr({
          githubService,
          gitService,
          gitlabService,
          secretService,
          configuration: getConfiguration()
        });
        if (!result) {
          return;
        }
        currentRepository = result.repository;

        const details =
          result.repository.provider === "github"
            ? await githubService.getPullRequest(result.repository, result.selected.number, await secretService.getGitHubToken())
            : await gitlabService.getPullRequest(
                result.repository,
                result.selected.number,
                await secretService.getGitLabToken()
              );
        prTreeProvider.setPullRequests(result.pullRequests);
        prTreeProvider.setActivePullRequest(details);
        reviewSession = await checkoutPr(gitService, details);
        pendingReviewComments = [];
        updateReviewDraftDecorations();
        await refreshWorkflowData();

        if (!reviewSession) {
          return;
        }

        await openFirstChangedFile(diffService, details);
        await refreshWorkflowData();
      } catch (error) {
        logger.error(`Open PR failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.refreshPullRequests", async () => {
      try {
        await refreshReview();
      } catch (error) {
        logger.error(`Refresh pull requests failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.checkoutPr", async (pr: PullRequestDetails) => {
      try {
        reviewSession = await checkoutPr(gitService, pr);
      } catch (error) {
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.openChangedFile", async (file) => {
      try {
        if (!reviewSession?.pr) {
          return;
        }
        await diffService.openFileDiff(file, reviewSession.pr.baseSha);
      } catch (error) {
        logger.error(`Open changed file failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.openFilePath", async (filePath: string) => {
      try {
        const uri = toWorkspaceFileUri(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      } catch (error) {
        logger.error(`Open file path failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.createPullRequest", async () => {
      try {
        const remoteUrl = await gitService.getOriginUrl();
        const currentBranch = await gitService.getCurrentBranch();
        const base = await vscode.window.showInputBox({ title: "Base branch", value: "main" });
        if (!base) {
          return;
        }
        const title = await vscode.window.showInputBox({ title: "Pull request title", value: `PR from ${currentBranch}` });
        if (!title) {
          return;
        }
        const body = await vscode.window.showInputBox({ title: "Pull request body", value: "" });
        const provider = getConfiguration().get<"github" | "gitlab">("provider", "github");
        if (provider === "github") {
          const repository = GitHubService.parseRepository(remoteUrl);
          if (!repository) {
            throw new Error("Could not detect a GitHub repository from the current workspace.");
          }
          const pr = await githubService.createPullRequest(repository, { title, body, head: currentBranch, base }, await secretService.getGitHubToken());
          currentRepository = { provider: "github", ...repository };
          logger.info(`Created pull request #${pr.number}`);
          vscode.window.showInformationMessage(`Created pull request #${pr.number}.`);
        } else {
          const repository = GitLabService.parseRepository(remoteUrl);
          if (!repository) {
            throw new Error("Could not detect a GitLab repository from the current workspace.");
          }
          const pr = await gitlabService.createPullRequest(
            repository,
            { title, body, head: currentBranch, base },
            await secretService.getGitLabToken()
          );
          currentRepository = { provider: "gitlab", ...repository };
          logger.info(`Created merge request !${pr.number}`);
          vscode.window.showInformationMessage(`Created merge request !${pr.number}.`);
        }
      } catch (error) {
        logger.error(`Create pull request failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.mergePullRequest", async () => {
      try {
        if (!reviewSession?.pr || !currentRepository) {
          throw new Error("Open a pull request before merging.");
        }
        if (currentRepository.provider === "github") {
          await githubService.mergePullRequest(currentRepository, reviewSession.pr.number, await secretService.getGitHubToken());
          logger.info(`Merged pull request #${reviewSession.pr.number}`);
          vscode.window.showInformationMessage(`Merged pull request #${reviewSession.pr.number}.`);
        } else {
          await gitlabService.mergePullRequest(currentRepository, reviewSession.pr.number, await secretService.getGitLabToken());
          logger.info(`Merged merge request !${reviewSession.pr.number}`);
          vscode.window.showInformationMessage(`Merged merge request !${reviewSession.pr.number}.`);
        }
      } catch (error) {
        logger.error(`Merge pull request failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.closePullRequest", async () => {
      try {
        if (!reviewSession?.pr || !currentRepository) {
          throw new Error("Open a pull request before closing it.");
        }
        if (currentRepository.provider === "github") {
          await githubService.closePullRequest(currentRepository, reviewSession.pr.number, await secretService.getGitHubToken());
          logger.info(`Closed pull request #${reviewSession.pr.number}`);
          vscode.window.showInformationMessage(`Closed pull request #${reviewSession.pr.number}.`);
        } else {
          await gitlabService.closePullRequest(currentRepository, reviewSession.pr.number, await secretService.getGitLabToken());
          logger.info(`Closed merge request !${reviewSession.pr.number}`);
          vscode.window.showInformationMessage(`Closed merge request !${reviewSession.pr.number}.`);
        }
      } catch (error) {
        logger.error(`Close pull request failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.editPullRequestMetadata", async () => {
      try {
        if (!reviewSession?.pr || !currentRepository) {
          throw new Error("Open a pull request before editing metadata.");
        }
        const reviewers = await vscode.window.showInputBox({ title: "Reviewers (comma-separated usernames)", value: "" });
        const labels = await vscode.window.showInputBox({ title: "Labels (comma-separated)", value: "" });
        const assignees = await vscode.window.showInputBox({ title: "Assignees (comma-separated usernames)", value: "" });
        const milestoneRaw = await vscode.window.showInputBox({ title: "Milestone number (optional)", value: "" });
        if (currentRepository.provider === "github") {
          await githubService.updatePullRequestMetadata(
            currentRepository,
            reviewSession.pr.number,
            {
              reviewers: splitCsv(reviewers),
              labels: splitCsv(labels),
              assignees: splitCsv(assignees),
              milestone: milestoneRaw ? Number(milestoneRaw) : undefined
            },
            await secretService.getGitHubToken()
          );
        } else {
          await gitlabService.updatePullRequestMetadata(
            currentRepository,
            reviewSession.pr.number,
            {
              reviewers: splitCsv(reviewers),
              labels: splitCsv(labels),
              assignees: splitCsv(assignees),
              milestone: milestoneRaw ? Number(milestoneRaw) : undefined
            },
            await secretService.getGitLabToken()
          );
        }
        logger.info(`Updated metadata for pull request #${reviewSession.pr.number}`);
        vscode.window.showInformationMessage(`Updated metadata for pull request #${reviewSession.pr.number}.`);
      } catch (error) {
        logger.error(`Edit metadata failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.addReviewComment", async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          throw new Error("Open a changed file and place the cursor on a line before adding a review comment.");
        }
        const body = await vscode.window.showInputBox({ title: "Review comment", prompt: "Add a pending review comment for the current line." });
        if (!body) {
          return;
        }
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
        pendingReviewComments.push({
          id: `${relativePath}:${editor.selection.active.line + 1}:${Date.now()}`,
          path: relativePath,
          line: editor.selection.active.line + 1,
          body
        });
        updateReviewDraftDecorations();
        logger.info(`Added pending review comment for ${relativePath}:${editor.selection.active.line + 1}`);
        vscode.window.showInformationMessage(`Added pending review comment for ${relativePath}:${editor.selection.active.line + 1}.`);
      } catch (error) {
        logger.error(`Add review comment failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.openReviewDraft", async (draft: PullRequestReviewCommentDraft) => {
      try {
        const uri = toWorkspaceFileUri(draft.path);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        const position = new vscode.Position(Math.max(0, draft.line - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      } catch (error) {
        logger.error(`Open review draft failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.removeReviewComment", async (draft?: PullRequestReviewCommentDraft) => {
      try {
        if (!draft) {
          return;
        }
        pendingReviewComments = pendingReviewComments.filter((comment) => comment.id !== draft.id);
        updateReviewDraftDecorations();
        vscode.window.showInformationMessage("Removed pending review comment.");
      } catch (error) {
        logger.error(`Remove review comment failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.clearReviewComments", async () => {
      pendingReviewComments = [];
      updateReviewDraftDecorations();
      vscode.window.showInformationMessage("Cleared pending review comments.");
    }),
    vscode.commands.registerCommand("prCopilot.submitReview", async () => {
      try {
        if (!reviewSession?.pr || !currentRepository) {
          throw new Error("Open a pull request before submitting a review.");
        }
        const selection = await vscode.window.showQuickPick(
          [
            { label: "Comment", event: "COMMENT" as const },
            { label: "Approve", event: "APPROVE" as const },
            { label: "Request Changes", event: "REQUEST_CHANGES" as const }
          ],
          { title: "Submit review" }
        );
        if (!selection) {
          return;
        }
        const body = await vscode.window.showInputBox({ title: "Review summary", value: "" });
        if (currentRepository.provider === "github") {
          await githubService.submitReview(
            currentRepository,
            reviewSession.pr.number,
            selection.event,
            body ?? "",
            pendingReviewComments,
            await secretService.getGitHubToken()
          );
        } else {
          await gitlabService.submitReview(
            currentRepository,
            reviewSession.pr.number,
            selection.event,
            body ?? "",
            pendingReviewComments,
            await secretService.getGitLabToken()
          );
        }
        logger.info(`Submitted ${selection.event} review for pull request #${reviewSession.pr.number}`);
        pendingReviewComments = [];
        updateReviewDraftDecorations();
        vscode.window.showInformationMessage(`Submitted ${selection.label.toLowerCase()} review.`);
      } catch (error) {
        logger.error(`Submit review failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.refreshIssues", async () => {
      await refreshWorkflowData();
    }),
    vscode.commands.registerCommand("prCopilot.refreshChecks", async () => {
      await refreshWorkflowData();
    }),
    vscode.commands.registerCommand("prCopilot.refreshSecurity", async () => {
      await refreshWorkflowData();
    }),
    vscode.commands.registerCommand("prCopilot.showLogs", () => {
      logger.show();
    }),
    vscode.commands.registerCommand("prCopilot.restoreBranch", async () => {
      try {
        const restored = await restoreBranch(gitService, reviewSession);
        if (restored) {
          reviewSession = undefined;
          pendingReviewComments = [];
          updateReviewDraftDecorations();
          void refreshWorkflowData();
          vscode.window.showInformationMessage("Restored the previous branch.");
        }
      } catch (error) {
        logger.error(`Restore branch failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.setGitHubToken", async () => {
      try {
        const token = await secretService.ensureGitHubToken({ forcePrompt: true });
        if (token) {
          vscode.window.showInformationMessage("GitHub token saved securely.");
          logger.info("GitHub token saved.");
        }
        await refreshWorkflowData();
      } catch (error) {
        logger.error(`Set GitHub token failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.clearGitHubToken", async () => {
      try {
        await secretService.clearGitHubToken();
        vscode.window.showInformationMessage("GitHub token cleared.");
        logger.info("GitHub token cleared.");
        await refreshWorkflowData();
      } catch (error) {
        logger.error(`Clear GitHub token failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.setScmToken", async () => {
      try {
        const provider = getScmProvider(getConfiguration());
        if (provider === "gitlab") {
          const token = await secretService.ensureGitLabToken({ forcePrompt: true });
          if (token) {
            vscode.window.showInformationMessage("GitLab token saved securely.");
            logger.info("GitLab token saved.");
          }
        } else {
          const token = await secretService.ensureGitHubToken({ forcePrompt: true });
          if (token) {
            vscode.window.showInformationMessage("GitHub token saved securely.");
            logger.info("GitHub token saved.");
          }
        }
        await refreshWorkflowData();
      } catch (error) {
        logger.error(`Set SCM token failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.clearScmToken", async () => {
      try {
        const provider = getScmProvider(getConfiguration());
        if (provider === "gitlab") {
          await secretService.clearGitLabToken();
          vscode.window.showInformationMessage("GitLab token cleared.");
          logger.info("GitLab token cleared.");
        } else {
          await secretService.clearGitHubToken();
          vscode.window.showInformationMessage("GitHub token cleared.");
          logger.info("GitHub token cleared.");
        }
        await refreshWorkflowData();
      } catch (error) {
        logger.error(`Clear SCM token failed: ${toErrorMessage(error)}`);
        showError(error);
      }
    }),
    { dispose: () => logger.dispose() },
    { dispose: () => reviewDraftDecoration.dispose() }
  );

  updateReviewDraftDecorations();
}

export function deactivate(): void {}

async function openFirstChangedFile(diffService: DiffService, pr: PullRequestDetails): Promise<void> {
  const firstFile = pr.files.find((file) => file.status !== "deleted");
  if (!firstFile) {
    return;
  }

  await diffService.openFileDiff(firstFile, pr.baseSha);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  void vscode.window.showErrorMessage(message);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const result = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return result.length > 0 ? result : undefined;
}

function getScmProvider(configuration: vscode.WorkspaceConfiguration): "github" | "gitlab" {
  return configuration.get<"github" | "gitlab">("provider", "github");
}
