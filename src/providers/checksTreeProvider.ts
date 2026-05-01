import * as vscode from "vscode";
import type { PipelineCheck } from "../models/workflow";

export class ChecksTreeProvider implements vscode.TreeDataProvider<PipelineCheck> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PipelineCheck | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private checks: PipelineCheck[] = [];

  setChecks(checks: PipelineCheck[]): void {
    this.checks = checks;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: PipelineCheck): vscode.TreeItem {
    const label = element.conclusion ? `${element.name} (${element.conclusion})` : `${element.name} (${element.status})`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = element.status;
    item.tooltip = element.detailsUrl ?? element.name;
    if (element.detailsUrl) {
      item.command = {
        command: "vscode.open",
        title: "Open Check",
        arguments: [vscode.Uri.parse(element.detailsUrl)]
      };
    }
    item.iconPath = new vscode.ThemeIcon(iconForCheck(element));
    return item;
  }

  getChildren(element?: PipelineCheck): vscode.ProviderResult<PipelineCheck[]> {
    if (element) {
      return [];
    }
    return this.checks;
  }
}

function iconForCheck(check: PipelineCheck): string {
  if (check.conclusion === "success") {
    return "pass";
  }
  if (check.conclusion === "failure" || check.conclusion === "cancelled" || check.conclusion === "timed_out") {
    return "error";
  }
  if (check.status === "in_progress" || check.status === "queued") {
    return "loading~spin";
  }
  return "question";
}
