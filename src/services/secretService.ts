import * as vscode from "vscode";

const GITHUB_TOKEN_SECRET = "prCopilot.githubToken";
const GITLAB_TOKEN_SECRET = "prCopilot.gitlabToken";

export class SecretService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getGitHubToken(): Promise<string | undefined> {
    return this.context.secrets.get(GITHUB_TOKEN_SECRET);
  }

  async getGitLabToken(): Promise<string | undefined> {
    return this.context.secrets.get(GITLAB_TOKEN_SECRET);
  }

  async ensureGitHubToken(options?: { forcePrompt?: boolean }): Promise<string | undefined> {
    if (!options?.forcePrompt) {
      const existing = await this.getGitHubToken();
      if (existing) {
        return existing;
      }
    }

    const value = await vscode.window.showInputBox({
      title: "Pull Request Review GitHub Token",
      prompt: "Enter your GitHub personal access token. It will be stored securely in VS Code.",
      password: true,
      ignoreFocusOut: true
    });

    if (!value) {
      return undefined;
    }

    await this.context.secrets.store(GITHUB_TOKEN_SECRET, value);
    return value;
  }

  async clearGitHubToken(): Promise<void> {
    await this.context.secrets.delete(GITHUB_TOKEN_SECRET);
  }

  async ensureGitLabToken(options?: { forcePrompt?: boolean }): Promise<string | undefined> {
    if (!options?.forcePrompt) {
      const existing = await this.getGitLabToken();
      if (existing) {
        return existing;
      }
    }

    const value = await vscode.window.showInputBox({
      title: "Pull Request Review GitLab Token",
      prompt: "Enter your GitLab personal access token. It will be stored securely in VS Code.",
      password: true,
      ignoreFocusOut: true
    });

    if (!value) {
      return undefined;
    }

    await this.context.secrets.store(GITLAB_TOKEN_SECRET, value);
    return value;
  }

  async clearGitLabToken(): Promise<void> {
    await this.context.secrets.delete(GITLAB_TOKEN_SECRET);
  }
}
