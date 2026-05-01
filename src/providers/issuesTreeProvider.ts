import * as vscode from "vscode";
import type { PullRequestIssue } from "../models/workflow";

export class IssuesTreeProvider implements vscode.TreeDataProvider<PullRequestIssue> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PullRequestIssue | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private issues: PullRequestIssue[] = [];

  setIssues(issues: PullRequestIssue[]): void {
    this.issues = issues;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: PullRequestIssue): vscode.TreeItem {
    const item = new vscode.TreeItem(`#${element.number} ${element.title}`, vscode.TreeItemCollapsibleState.None);
    item.description = `${element.author} · ${element.state}`;
    item.tooltip = element.url;
    item.command = {
      command: "vscode.open",
      title: "Open Issue",
      arguments: [vscode.Uri.parse(element.url)]
    };
    item.iconPath = new vscode.ThemeIcon(element.state === "open" ? "issues" : "pass");
    return item;
  }

  getChildren(element?: PullRequestIssue): vscode.ProviderResult<PullRequestIssue[]> {
    if (element) {
      return [];
    }
    return this.issues;
  }
}
