import * as vscode from "vscode";
import type { PullRequestDetails, PullRequestFile, PullRequestSummary } from "../models/pr";

type TreeNode = PullRequestSummary | PullRequestFile;

function isPullRequestSummary(node: TreeNode): node is PullRequestSummary {
  return "number" in node && "provider" in node && "sourceBranch" in node;
}

export class PrTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private pullRequests: PullRequestSummary[] = [];
  private activePullRequest?: PullRequestDetails;

  setPullRequests(pullRequests: PullRequestSummary[]): void {
    this.pullRequests = pullRequests;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  setActivePullRequest(pr: PullRequestDetails | undefined): void {
    this.activePullRequest = pr;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (isPullRequestSummary(element)) {
      const item = new vscode.TreeItem(
        `#${element.number} ${element.title}`,
        this.activePullRequest?.id === element.id
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      item.description = `${element.author} -> ${element.targetBranch}`;
      item.contextValue = "pullRequest";
      return item;
    }

    const item = new vscode.TreeItem(element.path, vscode.TreeItemCollapsibleState.None);
    item.description = `${element.additions}/-${element.deletions}`;
    item.contextValue = "pullRequestFile";
    item.command = {
      command: "prCopilot.openChangedFile",
      title: "Open Changed File",
      arguments: [element]
    };
    return item;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (!element) {
      return this.pullRequests;
    }

    if (isPullRequestSummary(element) && this.activePullRequest?.id === element.id) {
      return this.activePullRequest.files;
    }

    return [];
  }
}
