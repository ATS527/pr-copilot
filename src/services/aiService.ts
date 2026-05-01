import * as vscode from "vscode";
import type { PullRequestDetails } from "../models/pr";
import type { ReviewInsights, RiskInsight, SummaryInsight, TestSuggestion } from "../models/insight";
import { chunkText } from "../utils/chunking";
import { tryParseJson } from "../utils/parsing";
import { type AiProvider, SecretService } from "./secretService";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class AiService {
  constructor(private readonly secretService: SecretService) {}

  async generateInsights(pr: PullRequestDetails): Promise<ReviewInsights> {
    const provider = this.getProvider();
    const apiKey = await this.secretService.ensureAiProviderKey(provider);
    if (!apiKey && provider !== "ollama") {
      throw new Error(`${providerDisplayName(provider)} API key is required to generate AI insights.`);
    }

    const enabledSections = this.getEnabledSections();
    const chunks = this.buildDiffChunks(pr, provider);

    const [summary, risks, tests] = await Promise.all([
      enabledSections.summary
        ? this.requestSummary(apiKey, pr, chunks)
        : Promise.resolve<SummaryInsight>({
            overview: "Summary generation is disabled in PR Copilot settings.",
            keyChanges: [],
            impactedAreas: []
          }),
      enabledSections.risks ? this.requestRisks(apiKey, pr, chunks) : Promise.resolve<RiskInsight[]>([]),
      enabledSections.tests ? this.requestTests(apiKey, pr, chunks) : Promise.resolve<TestSuggestion[]>([])
    ]);

    return { summary, risks, tests };
  }

  private buildDiffChunks(pr: PullRequestDetails, provider: AiProvider): string[] {
    const configuration = getPrCopilotConfiguration();
    const configuredMaxFiles = Math.max(1, configuration.get<number>("ai.maxFilesPerInsight", 20));
    const configuredMaxDiffCharacters = Math.max(2000, configuration.get<number>("ai.maxDiffCharacters", 48000));
    const configuredMaxChunkCharacters = Math.max(2000, configuration.get<number>("ai.maxChunkCharacters", 12000));
    const maxFiles = provider === "ollama" ? Math.min(configuredMaxFiles, 8) : configuredMaxFiles;
    const maxDiffCharacters = provider === "ollama" ? Math.min(configuredMaxDiffCharacters, 18000) : configuredMaxDiffCharacters;
    const maxChunkCharacters =
      provider === "ollama" ? Math.min(configuredMaxChunkCharacters, 6000) : configuredMaxChunkCharacters;
    const selectedFiles = pr.files.slice(0, maxFiles);
    const fileSections: string[] = [];
    let remainingCharacters = maxDiffCharacters;

    for (const file of selectedFiles) {
      if (remainingCharacters <= 0) {
        break;
      }

      const header = `FILE: ${file.path}\n`;
      const patch = (file.patch ?? "No patch available.").slice(0, Math.max(0, remainingCharacters - header.length));
      const section = `${header}${patch}`;
      fileSections.push(section);
      remainingCharacters -= section.length + 2;
    }

    const diffText = fileSections.join("\n\n");
    return chunkText(diffText, maxChunkCharacters);
  }

  private getEnabledSections(): { summary: boolean; risks: boolean; tests: boolean } {
    const configuration = getPrCopilotConfiguration();
    return {
      summary: configuration.get<boolean>("ai.enableSummary", true),
      risks: configuration.get<boolean>("ai.enableRisks", true),
      tests: configuration.get<boolean>("ai.enableTests", true)
    };
  }

  private async requestSummary(apiKey: string | undefined, pr: PullRequestDetails, chunks: string[]): Promise<SummaryInsight> {
    const prompt = [
      "Summarize this pull request for a reviewer.",
      "Return strict JSON with keys: overview, keyChanges, impactedAreas.",
      "keyChanges must be an array of short strings or objects with keys file and change.",
      "impactedAreas must be an array of high-level impacted areas such as modules, layers, workflows, or architectural zones.",
      "Do not repeat the changed file list inside impactedAreas.",
      "Examples of impactedAreas: service layer wiring, controller-to-service dependency injection, payment flow, authentication module.",
      `PR title: ${pr.title}`,
      `PR body: ${pr.body ?? "N/A"}`,
      chunks.join("\n\n")
    ].join("\n\n");

    const content = await this.chat(apiKey, prompt);
    return (
      tryParseJson<SummaryInsight>(content) ?? {
        overview: content,
        keyChanges: [],
        impactedAreas: []
      }
    );
  }

  private async requestRisks(apiKey: string | undefined, pr: PullRequestDetails, chunks: string[]): Promise<RiskInsight[]> {
    const prompt = [
      "Identify likely code review risks in this pull request.",
      "Return strict JSON array with objects: title, description, severity, filePath, line.",
      "Always include filePath when you can infer the affected file from the diff.",
      "Use severity values low, medium, or high only.",
      "Use line as a number when you can infer an approximate line, otherwise omit it.",
      `PR title: ${pr.title}`,
      chunks.join("\n\n")
    ].join("\n\n");

    const content = await this.chat(apiKey, prompt);
    return tryParseJson<RiskInsight[]>(content) ?? [];
  }

  private async requestTests(apiKey: string | undefined, pr: PullRequestDetails, chunks: string[]): Promise<TestSuggestion[]> {
    const changedFiles = pr.files.map((file) => file.path).join("\n");
    const prompt = [
      "Generate test suggestions for this pull request.",
      "Return strict JSON array with objects: scenario, rationale, filePath, target.",
      "Only reference files, classes, methods, and controllers that appear in the changed files or PR title/body.",
      "Do not invent hypothetical controllers, classes, endpoints, or modules.",
      "Prioritize the highest-value regression, wiring, and behavior tests over generic repetitions.",
      "Prefer concise, actionable test suggestions tied to changed files.",
      "If a suggestion applies to a specific changed file, include filePath.",
      "Changed files:",
      changedFiles,
      `PR title: ${pr.title}`,
      chunks.join("\n\n")
    ].join("\n\n");

    const content = await this.chat(apiKey, prompt);
    return tryParseJson<TestSuggestion[]>(content) ?? [];
  }

  private async chat(apiKey: string | undefined, prompt: string): Promise<string> {
    const provider = this.getProvider();

    switch (provider) {
      case "openai":
      case "openai-compatible":
        return this.chatWithOpenAiCompatible(apiKey, prompt, provider);
      case "gemini":
        return this.chatWithGemini(apiKey as string, prompt);
      case "anthropic":
        return this.chatWithAnthropic(apiKey as string, prompt);
      case "ollama":
        return this.chatWithOpenAiCompatible(undefined, prompt, "ollama");
    }
  }

  private getProvider(): AiProvider {
    return getPrCopilotConfiguration().get<AiProvider>("ai.provider", "openai");
  }

  private async chatWithOpenAiCompatible(
    apiKey: string | undefined,
    prompt: string,
    provider: "openai" | "openai-compatible" | "ollama"
  ): Promise<string> {
    const defaultBaseUrl =
      provider === "openai"
        ? "https://api.openai.com/v1"
        : "http://localhost:11434/v1";
    const configuration = getPrCopilotConfiguration();
    const baseUrl =
      provider === "ollama"
        ? configuration.get<string>("ai.ollamaBaseUrl") ?? defaultBaseUrl
        : configuration.get<string>("ai.baseUrl") ?? defaultBaseUrl;
    const model = configuration.get<string>("ai.model") ?? defaultModelForProvider(provider);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You are a concise senior engineer helping review pull requests."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = (await this.readJsonResponse<ChatCompletionResponse>(response, providerDisplayName(provider))) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async chatWithAnthropic(apiKey: string, prompt: string): Promise<string> {
    const configuration = getPrCopilotConfiguration();
    const model = configuration.get<string>("ai.model") ?? "claude-3-5-sonnet-latest";
    const anthropicVersion = configuration.get<string>("ai.anthropicVersion") ?? "2023-06-01";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": anthropicVersion
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: "You are a concise senior engineer helping review pull requests.",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await this.readJsonResponse<AnthropicResponse>(response, "Anthropic");
    return (
      data.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n") ?? ""
    );
  }

  private async chatWithGemini(apiKey: string, prompt: string): Promise<string> {
    const configuration = getPrCopilotConfiguration();
    const baseUrl = configuration.get<string>("ai.geminiBaseUrl") ?? "https://generativelanguage.googleapis.com/v1beta";
    const model = configuration.get<string>("ai.model") ?? "gemini-2.5-pro";
    const response = await fetch(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are a concise senior engineer helping review pull requests."
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2
          }
        })
      }
    );

    const data = await this.readJsonResponse<GeminiResponse>(response, "Gemini");
    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("\n") ?? ""
    );
  }

  private async readJsonResponse<T>(response: Response, providerName: string): Promise<T> {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${providerName} request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  }
}

function getPrCopilotConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("prCopilot");
}

function providerDisplayName(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "openai-compatible":
      return "OpenAI-compatible";
    case "gemini":
      return "Gemini";
    case "anthropic":
      return "Anthropic";
    case "ollama":
      return "Ollama";
  }
}

function defaultModelForProvider(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4.1-mini";
    case "openai-compatible":
      return "gpt-4.1-mini";
    case "gemini":
      return "gemini-2.5-flash";
    case "anthropic":
      return "claude-3-5-sonnet-latest";
    case "ollama":
      return "qwen2.5-coder:7b-instruct";
  }
}
