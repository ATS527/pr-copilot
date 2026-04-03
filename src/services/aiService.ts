import * as vscode from "vscode";
import type { PullRequestDetails } from "../models/pr";
import type { ReviewInsights, RiskInsight, SummaryInsight, TestSuggestion } from "../models/insight";
import { chunkText } from "../utils/chunking";
import { tryParseJson } from "../utils/parsing";
import { SecretService } from "./secretService";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class AiService {
  constructor(
    private readonly secretService: SecretService,
    private readonly configuration: vscode.WorkspaceConfiguration
  ) {}

  async generateInsights(pr: PullRequestDetails): Promise<ReviewInsights> {
    const apiKey = await this.secretService.ensureLlmApiKey();
    if (!apiKey) {
      throw new Error("LLM API key is required to generate AI insights.");
    }

    const diffText = pr.files
      .map((file) => `FILE: ${file.path}\n${file.patch ?? "No patch available."}`)
      .join("\n\n");
    const chunks = chunkText(diffText, 12000);

    const [summary, risks, tests] = await Promise.all([
      this.requestSummary(apiKey, pr, chunks),
      this.requestRisks(apiKey, pr, chunks),
      this.requestTests(apiKey, pr, chunks)
    ]);

    return { summary, risks, tests };
  }

  private async requestSummary(apiKey: string, pr: PullRequestDetails, chunks: string[]): Promise<SummaryInsight> {
    const prompt = [
      "Summarize this pull request for a reviewer.",
      "Return strict JSON with keys: overview, keyChanges, impactedAreas.",
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

  private async requestRisks(apiKey: string, pr: PullRequestDetails, chunks: string[]): Promise<RiskInsight[]> {
    const prompt = [
      "Identify likely code review risks in this pull request.",
      "Return strict JSON array with objects: title, description, severity, filePath, line.",
      `PR title: ${pr.title}`,
      chunks.join("\n\n")
    ].join("\n\n");

    const content = await this.chat(apiKey, prompt);
    return tryParseJson<RiskInsight[]>(content) ?? [];
  }

  private async requestTests(apiKey: string, pr: PullRequestDetails, chunks: string[]): Promise<TestSuggestion[]> {
    const prompt = [
      "Generate test suggestions for this pull request.",
      "Return strict JSON array with objects: scenario, rationale, filePath, target.",
      `PR title: ${pr.title}`,
      chunks.join("\n\n")
    ].join("\n\n");

    const content = await this.chat(apiKey, prompt);
    return tryParseJson<TestSuggestion[]>(content) ?? [];
  }

  private async chat(apiKey: string, prompt: string): Promise<string> {
    const baseUrl = this.configuration.get<string>("ai.baseUrl") ?? "https://api.openai.com/v1";
    const model = this.configuration.get<string>("ai.model") ?? "gpt-4.1-mini";
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content ?? "";
  }
}
