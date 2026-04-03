import * as vscode from "vscode";
import type { PullRequestDetails, ReviewSession } from "../models/pr";
import { GitService } from "../services/gitService";

export async function checkoutPr(
  gitService: GitService,
  pr: PullRequestDetails
): Promise<ReviewSession | undefined> {
  const status = await gitService.getWorkingTreeStatus();
  if (!status.isClean) {
    const choice = await vscode.window.showWarningMessage(
      "Your working tree has uncommitted changes. Switching branches may fail or hide local work.",
      { modal: true },
      "Continue",
      "Cancel"
    );

    if (choice !== "Continue") {
      return undefined;
    }
  }

  const result = await gitService.checkoutPullRequest(pr);
  return {
    pr,
    previousBranch: result.previousBranch,
    checkedOutBranch: result.checkedOutBranch
  };
}
