import * as vscode from "vscode";

const LLM_API_KEY_SECRET = "prCopilot.llmApiKey";
const GITHUB_TOKEN_SECRET = "prCopilot.githubToken";

export class SecretService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getLlmApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(LLM_API_KEY_SECRET);
  }

  async getGitHubToken(): Promise<string | undefined> {
    return this.context.secrets.get(GITHUB_TOKEN_SECRET);
  }

  async ensureLlmApiKey(): Promise<string | undefined> {
    const existing = await this.getLlmApiKey();
    if (existing) {
      return existing;
    }

    const value = await vscode.window.showInputBox({
      title: "PR Copilot API Key",
      prompt: "Enter your LLM API key. It will be stored securely in VS Code.",
      password: true,
      ignoreFocusOut: true
    });

    if (!value) {
      return undefined;
    }

    await this.context.secrets.store(LLM_API_KEY_SECRET, value);
    return value;
  }

  async ensureGitHubToken(options?: { forcePrompt?: boolean }): Promise<string | undefined> {
    if (!options?.forcePrompt) {
      const existing = await this.getGitHubToken();
      if (existing) {
        return existing;
      }
    }

    const value = await vscode.window.showInputBox({
      title: "PR Copilot GitHub Token",
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
}
