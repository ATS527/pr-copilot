import * as vscode from "vscode";

const LLM_API_KEY_SECRET = "prCopilot.llmApiKey";
const GITHUB_TOKEN_SECRET = "prCopilot.githubToken";
const GITLAB_TOKEN_SECRET = "prCopilot.gitlabToken";

export type AiProvider = "openai" | "openai-compatible" | "gemini" | "anthropic" | "ollama";

const AI_PROVIDER_SECRET_KEYS: Record<AiProvider, string> = {
  openai: "prCopilot.ai.openaiKey",
  "openai-compatible": "prCopilot.ai.openaiCompatibleKey",
  gemini: "prCopilot.ai.geminiKey",
  anthropic: "prCopilot.ai.anthropicKey",
  ollama: "prCopilot.ai.ollamaKey"
};

export class SecretService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getLlmApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(LLM_API_KEY_SECRET);
  }

  async getAiProviderKey(provider: AiProvider): Promise<string | undefined> {
    return this.context.secrets.get(AI_PROVIDER_SECRET_KEYS[provider]);
  }

  async getGitHubToken(): Promise<string | undefined> {
    return this.context.secrets.get(GITHUB_TOKEN_SECRET);
  }

  async getGitLabToken(): Promise<string | undefined> {
    return this.context.secrets.get(GITLAB_TOKEN_SECRET);
  }

  async ensureLlmApiKey(): Promise<string | undefined> {
    return this.promptForLlmApiKey();
  }

  async promptForLlmApiKey(options?: { forcePrompt?: boolean }): Promise<string | undefined> {
    if (!options?.forcePrompt) {
      const existing = await this.getLlmApiKey();
      if (existing) {
        return existing;
      }
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

  async ensureAiProviderKey(provider: AiProvider, options?: { forcePrompt?: boolean }): Promise<string | undefined> {
    if (provider === "ollama") {
      return undefined;
    }

    if (!options?.forcePrompt) {
      const existing = await this.getAiProviderKey(provider);
      if (existing) {
        return existing;
      }
    }

    const value = await vscode.window.showInputBox({
      title: `PR Copilot ${providerLabel(provider)} API Key`,
      prompt: `Enter your ${providerLabel(provider)} API key. It will be stored securely in VS Code.`,
      password: true,
      ignoreFocusOut: true
    });

    if (!value) {
      return undefined;
    }

    await this.context.secrets.store(AI_PROVIDER_SECRET_KEYS[provider], value);
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

  async ensureGitLabToken(options?: { forcePrompt?: boolean }): Promise<string | undefined> {
    if (!options?.forcePrompt) {
      const existing = await this.getGitLabToken();
      if (existing) {
        return existing;
      }
    }

    const value = await vscode.window.showInputBox({
      title: "PR Copilot GitLab Token",
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

  async clearLlmApiKey(): Promise<void> {
    await this.context.secrets.delete(LLM_API_KEY_SECRET);
  }

  async clearAiProviderKey(provider: AiProvider): Promise<void> {
    if (provider === "ollama") {
      return;
    }

    await this.context.secrets.delete(AI_PROVIDER_SECRET_KEYS[provider]);
  }
}

function providerLabel(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "openai-compatible":
      return "OpenAI-Compatible";
    case "gemini":
      return "Gemini";
    case "anthropic":
      return "Anthropic";
    case "ollama":
      return "Ollama";
  }
}
