import * as path from "node:path";
import * as vscode from "vscode";

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function requireWorkspaceRoot(): string {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error("Open a repository folder before using PR Copilot.");
  }
  return root;
}

export function toWorkspaceFileUri(relativePath: string): vscode.Uri {
  return vscode.Uri.file(path.join(requireWorkspaceRoot(), relativePath));
}
