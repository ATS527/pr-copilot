import * as vscode from "vscode";

export async function refreshReview(): Promise<void> {
  await vscode.commands.executeCommand("prCopilot.openPr");
}
