import * as vscode from "vscode";
import type { PullRequestFile } from "../models/pr";
import { GitService } from "./gitService";
import { toWorkspaceFileUri } from "../utils/workspace";

const PR_COPILOT_BASE_SCHEME = "pr-copilot-base";
const PR_COPILOT_EMPTY_SCHEME = "pr-copilot-empty";

interface BaseContentQuery {
  ref: string;
  path: string;
}

export class DiffService implements vscode.TextDocumentContentProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly gitService: GitService) {}

  async openFileDiff(file: PullRequestFile, baseRef?: string): Promise<void> {
    const headUri = this.toHeadUri(file);
    const baseUri = await this.toBaseUri(file, baseRef);
    const title = `${file.path} (${baseRef ?? "base"} ↔ working tree)`;

    await vscode.commands.executeCommand("vscode.diff", baseUri, headUri, title, {
      preview: false
    });
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    if (uri.scheme === PR_COPILOT_EMPTY_SCHEME) {
      return "";
    }

    if (uri.scheme !== PR_COPILOT_BASE_SCHEME) {
      return "";
    }

    const query = decodeBaseContentQuery(uri);
    return query.content;
  }

  private async toBaseUri(file: PullRequestFile, baseRef?: string): Promise<vscode.Uri> {
    if (!baseRef || file.status === "added") {
      return this.toEmptyUri(`${file.path}.base`);
    }

    const pathAtBase = file.previousPath ?? file.path;
    const content = await this.gitService.readFileAtRef(baseRef, pathAtBase);
    if (content === undefined) {
      return this.toEmptyUri(`${pathAtBase}.base`);
    }

    return vscode.Uri.from({
      scheme: PR_COPILOT_BASE_SCHEME,
      path: `/${pathAtBase}`,
      query: encodeURIComponent(
        JSON.stringify({
          ref: baseRef,
          path: pathAtBase,
          content
        })
      )
    });
  }

  private toHeadUri(file: PullRequestFile): vscode.Uri {
    if (file.status === "deleted") {
      return this.toEmptyUri(`${file.path}.head`);
    }

    return toWorkspaceFileUri(file.path);
  }

  private toEmptyUri(name: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: PR_COPILOT_EMPTY_SCHEME,
      path: `/${name}`
    });
  }
}

function decodeBaseContentQuery(uri: vscode.Uri): BaseContentQuery & { content: string } {
  return JSON.parse(decodeURIComponent(uri.query)) as BaseContentQuery & { content: string };
}
