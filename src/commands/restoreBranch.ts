import * as vscode from "vscode";
import type { ReviewSession } from "../models/pr";
import { GitService } from "../services/gitService";

export async function restoreBranch(
  gitService: GitService,
  session: ReviewSession | undefined
): Promise<boolean> {
  if (!session?.previousBranch) {
    await vscode.window.showInformationMessage("There is no previous branch stored for this review session.");
    return false;
  }

  const status = await gitService.getWorkingTreeStatus();
  if (!status.isClean) {
    const choice = await vscode.window.showWarningMessage(
      "Your working tree has uncommitted changes. Restoring the previous branch may fail.",
      { modal: true },
      "Continue",
      "Cancel"
    );

    if (choice !== "Continue") {
      return false;
    }
  }

  await gitService.restoreBranch(session.previousBranch);
  return true;
}
