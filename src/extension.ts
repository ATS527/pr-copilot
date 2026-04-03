import * as vscode from "vscode";
import { checkoutPr } from "./commands/checkoutPr";
import { openPr } from "./commands/openPr";
import { refreshReview } from "./commands/refreshReview";
import { restoreBranch } from "./commands/restoreBranch";
import type { ReviewInsights } from "./models/insight";
import type { PullRequestDetails, ReviewSession } from "./models/pr";
import { InsightsViewProvider } from "./providers/insightsViewProvider";
import { PrTreeProvider } from "./providers/prTreeProvider";
import { AiService } from "./services/aiService";
import { DiffService } from "./services/diffService";
import { GitService } from "./services/gitService";
import { GitHubService } from "./services/githubService";
import { GitLabService } from "./services/gitlabService";
import { SecretService } from "./services/secretService";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("prCopilot");
  const secretService = new SecretService(context);
  const githubService = new GitHubService();
  const gitlabService = new GitLabService();
  const gitService = new GitService();
  const diffService = new DiffService(gitService);
  const aiService = new AiService(secretService, configuration);
  const prTreeProvider = new PrTreeProvider();
  const insightsProvider = new InsightsViewProvider();

  let reviewSession: ReviewSession | undefined;
  let reviewInsights: ReviewInsights | undefined;

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("pr-copilot-base", diffService),
    vscode.workspace.registerTextDocumentContentProvider("pr-copilot-empty", diffService),
    vscode.window.registerTreeDataProvider("prCopilot.pullRequests", prTreeProvider),
    vscode.window.registerWebviewViewProvider(InsightsViewProvider.viewType, insightsProvider),
    vscode.commands.registerCommand("prCopilot.openPr", async () => {
      try {
        const result = await openPr({
          githubService,
          gitService,
          gitlabService,
          secretService,
          configuration
        });
        if (!result) {
          return;
        }

        const details = await githubService.getPullRequest(
          result.repository.owner,
          result.repository.repo,
          result.selected.number,
          await secretService.getGitHubToken()
        );
        prTreeProvider.setPullRequests(result.pullRequests);
        prTreeProvider.setActivePullRequest(details);
        reviewSession = await checkoutPr(gitService, details);
        reviewInsights = undefined;
        insightsProvider.update(details, undefined);

        if (!reviewSession) {
          return;
        }

        await openFirstChangedFile(diffService, details);
        reviewInsights = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "PR Copilot is generating AI insights"
          },
          () => aiService.generateInsights(details)
        );
        insightsProvider.update(details, reviewInsights);
      } catch (error) {
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.refreshPullRequests", async () => {
      try {
        await refreshReview();
      } catch (error) {
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
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.restoreBranch", async () => {
      try {
        const restored = await restoreBranch(gitService, reviewSession);
        if (restored) {
          reviewSession = undefined;
          reviewInsights = undefined;
          insightsProvider.update(undefined, undefined);
          vscode.window.showInformationMessage("Restored the previous branch.");
        }
      } catch (error) {
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.setGitHubToken", async () => {
      try {
        const token = await secretService.ensureGitHubToken({ forcePrompt: true });
        if (token) {
          vscode.window.showInformationMessage("GitHub token saved securely.");
        }
      } catch (error) {
        showError(error);
      }
    }),
    vscode.commands.registerCommand("prCopilot.clearGitHubToken", async () => {
      try {
        await secretService.clearGitHubToken();
        vscode.window.showInformationMessage("GitHub token cleared.");
      } catch (error) {
        showError(error);
      }
    })
  );

  insightsProvider.update(undefined, undefined);
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
