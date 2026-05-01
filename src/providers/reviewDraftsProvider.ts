import * as vscode from "vscode";
import type { PullRequestReviewCommentDraft } from "../models/workflow";

export class ReviewDraftsProvider implements vscode.TreeDataProvider<PullRequestReviewCommentDraft> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PullRequestReviewCommentDraft | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private drafts: PullRequestReviewCommentDraft[] = [];

  setDrafts(drafts: PullRequestReviewCommentDraft[]): void {
    this.drafts = drafts;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: PullRequestReviewCommentDraft): vscode.TreeItem {
    const item = new vscode.TreeItem(`${element.path}:${element.line}`, vscode.TreeItemCollapsibleState.None);
    item.description = element.body;
    item.tooltip = element.body;
    item.contextValue = "reviewDraft";
    item.command = {
      command: "prCopilot.openReviewDraft",
      title: "Open Review Draft",
      arguments: [element]
    };
    item.iconPath = new vscode.ThemeIcon("comment-draft");
    return item;
  }

  getChildren(element?: PullRequestReviewCommentDraft): vscode.ProviderResult<PullRequestReviewCommentDraft[]> {
    if (element) {
      return [];
    }
    return this.drafts;
  }
}
