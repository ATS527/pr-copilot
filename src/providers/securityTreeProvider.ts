import * as vscode from "vscode";
import type { SecurityFinding } from "../models/workflow";

export class SecurityTreeProvider implements vscode.TreeDataProvider<SecurityFinding> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SecurityFinding | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private findings: SecurityFinding[] = [];

  setFindings(findings: SecurityFinding[]): void {
    this.findings = findings;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: SecurityFinding): vscode.TreeItem {
    const item = new vscode.TreeItem(element.ruleId ? `${element.ruleId}: ${element.description}` : element.description, vscode.TreeItemCollapsibleState.None);
    item.description = [element.severity, formatLocation(element.filePath, element.line)].filter(Boolean).join(" · ");
    item.tooltip = element.htmlUrl ?? element.description;
    if (element.htmlUrl) {
      item.command = {
        command: "vscode.open",
        title: "Open Finding",
        arguments: [vscode.Uri.parse(element.htmlUrl)]
      };
    }
    item.iconPath = new vscode.ThemeIcon(iconForSeverity(element.severity));
    return item;
  }

  getChildren(element?: SecurityFinding): vscode.ProviderResult<SecurityFinding[]> {
    if (element) {
      return [];
    }
    return this.findings;
  }
}

function iconForSeverity(severity?: string): string {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "shield";
  }
}

function formatLocation(filePath?: string, line?: number): string | undefined {
  if (filePath && typeof line === "number") {
    return `${filePath}:${line}`;
  }
  return filePath;
}
