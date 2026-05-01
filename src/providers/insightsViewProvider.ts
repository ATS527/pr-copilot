import * as vscode from "vscode";
import type { ReviewInsights } from "../models/insight";
import type { PullRequestDetails } from "../models/pr";
import type { AiProvider } from "../services/secretService";

interface OnboardingState {
  aiProvider: AiProvider;
  aiModel: string;
  hasAiKey: boolean;
  hasGitHubToken: boolean;
  enabledInsights: string[];
}

export class InsightsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "prCopilot.insights";

  private view?: vscode.WebviewView;
  private pr?: PullRequestDetails;
  private insights?: ReviewInsights;
  private onboardingState: OnboardingState = {
    aiProvider: "openai",
    aiModel: "gpt-4.1-mini",
    hasAiKey: false,
    hasGitHubToken: false,
    enabledInsights: ["Summary", "Risks", "Tests"]
  };

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: false, enableCommandUris: true };
    this.render();
  }

  update(
    pr: PullRequestDetails | undefined,
    insights: ReviewInsights | undefined,
    onboardingState?: OnboardingState
  ): void {
    this.pr = pr;
    this.insights = insights;
    if (onboardingState) {
      this.onboardingState = onboardingState;
    }
    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }

    const title = this.pr ? `PR #${this.pr.number}: ${this.pr.title}` : "No pull request selected";
    const summary = this.insights?.summary;
    const risks = this.insights?.risks ?? [];
    const tests = this.insights?.tests ?? [];

    this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <style>
      body {
        font-family: var(--vscode-font-family);
        padding: 12px;
        color: var(--vscode-foreground);
      }
      .card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 14px;
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, white 8%);
      }
      .status-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .status-row:last-child {
        border-bottom: none;
      }
      .label {
        font-weight: 600;
      }
      .ok {
        color: var(--vscode-testing-iconPassed);
      }
      .missing {
        color: var(--vscode-testing-iconFailed);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .button {
        display: inline-block;
        padding: 7px 10px;
        border-radius: 8px;
        text-decoration: none;
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
      }
      .button.secondary {
        color: var(--vscode-textLink-foreground);
        background: transparent;
        border: 1px solid var(--vscode-panel-border);
      }
      .meta {
        color: var(--vscode-descriptionForeground);
        font-size: 0.92em;
      }
      .link {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
      }
      .link:hover {
        text-decoration: underline;
      }
      ul {
        padding-left: 18px;
      }
    </style>
  </head>
  <body style="font-family: var(--vscode-font-family); padding: 12px;">
    ${this.shouldShowOnboardingCard() ? this.renderOnboardingCard() : ""}
    <h2>${escapeHtml(title)}</h2>
    <section>
      <h3>Summary</h3>
      ${this.renderSummary(summary)}
    </section>
    <section>
      <h3>Risks</h3>
      ${risks.length > 0 ? `<ul>${risks
        .map((risk) => this.renderRisk(risk))
        .join("")}</ul>` : "<p>No risks yet.</p>"}
    </section>
    <section>
      <h3>Tests</h3>
      ${tests.length > 0 ? `<ul>${tests
        .map((test) => this.renderTest(test))
        .join("")}</ul>` : "<p>No test suggestions yet.</p>"}
    </section>
  </body>
</html>`;
  }

  private renderOnboardingCard(): string {
    const aiProvider = providerLabel(this.onboardingState.aiProvider);
    const providerCommand = commandUri("prCopilot.selectAiProvider");
    const aiKeyCommand = commandUri("prCopilot.setAiToken");
    const githubTokenCommand = commandUri("prCopilot.setGitHubToken");
    const openPrCommand = commandUri("prCopilot.openPr");
    const insightModesCommand = commandUri("prCopilot.selectInsightSections");

    return `<section class="card">
      <h3>Get Started</h3>
      <div class="status-row">
        <span class="label">AI provider</span>
        <span>${escapeHtml(aiProvider)}</span>
      </div>
      <div class="status-row">
        <span class="label">AI API key</span>
        <span class="${this.onboardingState.hasAiKey ? "ok" : "missing"}">
          ${this.onboardingState.aiProvider === "ollama" ? "Not required" : this.onboardingState.hasAiKey ? "Configured" : "Missing"}
        </span>
      </div>
      <div class="status-row">
        <span class="label">AI model</span>
        <span>${escapeHtml(this.onboardingState.aiModel)}</span>
      </div>
      <div class="status-row">
        <span class="label">Insight modes</span>
        <span>${escapeHtml(this.onboardingState.enabledInsights.join(", "))}</span>
      </div>
      <div class="status-row">
        <span class="label">GitHub token</span>
        <span class="${this.onboardingState.hasGitHubToken ? "ok" : "missing"}">
          ${this.onboardingState.hasGitHubToken ? "Configured" : "Missing"}
        </span>
      </div>
      <div class="actions">
        <a class="button" href="${providerCommand}">Select Provider</a>
        <a class="button" href="${insightModesCommand}">Choose Insights</a>
        <a class="button" href="${aiKeyCommand}">Set AI API Key</a>
        ${
          this.onboardingState.hasGitHubToken
            ? ""
            : `<a class="button" href="${githubTokenCommand}">Set GitHub Token</a>`
        }
        <a class="button secondary" href="${openPrCommand}">Open PR</a>
      </div>
    </section>`;
  }

  private shouldShowOnboardingCard(): boolean {
    const aiReady = this.onboardingState.aiProvider === "ollama" || this.onboardingState.hasAiKey;
    if (!aiReady || !this.onboardingState.hasGitHubToken) {
      return true;
    }

    return !this.pr;
  }

  private renderSummary(summary: ReviewInsights["summary"]): string {
    if (!summary) {
      return "<p>AI summary will appear here.</p>";
    }

    const keyChanges = summary.keyChanges.length > 0 ? `<ul>${summary.keyChanges
      .map((item) => this.renderKeyChange(item))
      .join("")}</ul>` : "";
    const impactedAreasItems = summary.impactedAreas.filter((item) => !isPathOnlyArea(item));
    const impactedAreas = impactedAreasItems.length > 0 ? `<ul>${impactedAreasItems
      .map((item) => this.renderImpactedArea(item))
      .join("")}</ul>` : "";

    return `
      <p>${escapeHtml(summary.overview)}</p>
      ${keyChanges ? `<h4>Key Changes</h4>${keyChanges}` : ""}
      ${impactedAreas ? `<h4>Impacted Areas</h4>${impactedAreas}` : ""}
    `;
  }

  private renderKeyChange(item: unknown): string {
    const parsed = parseChangeLike(item);
    if (!parsed?.filePath) {
      return `<li>${escapeHtml(item)}</li>`;
    }

    return `<li>
      ${this.renderFileLink(parsed.filePath)}
      ${parsed.message ? `<div>${escapeHtml(parsed.message)}</div>` : ""}
    </li>`;
  }

  private renderImpactedArea(item: unknown): string {
    const filePath = parseFilePathLike(item);
    if (!filePath) {
      return `<li>${escapeHtml(item)}</li>`;
    }

    return `<li>${this.renderFileLink(filePath)}</li>`;
  }

  private renderRisk(risk: { severity: string; title: unknown; description?: unknown; filePath?: string; line?: number }): string {
    const location = formatLocation(risk.filePath, risk.line);

    return `<li>
      <strong>${escapeHtml(String(risk.severity).toUpperCase())}</strong>: ${escapeHtml(risk.title)}
      ${location ? `<div class="meta">${escapeHtml(location)}</div>` : ""}
      ${risk.description ? `<div>${escapeHtml(risk.description)}</div>` : ""}
    </li>`;
  }

  private renderFileLink(filePath: string): string {
    const label = baseName(filePath);
    const link = commandUri("prCopilot.openFilePath", [filePath]);
    return `<a class="link" href="${link}">${escapeHtml(label)}</a> <span class="meta">${escapeHtml(filePath)}</span>`;
  }

  private renderTest(test: { scenario: unknown; rationale?: unknown; filePath?: string; target?: string }): string {
    const target = test.target ? `<div class="meta">${escapeHtml(test.target)}</div>` : "";
    const file = test.filePath ? `<div class="meta">${this.renderFileLink(test.filePath)}</div>` : "";
    const rationale = test.rationale ? `<div>${escapeHtml(test.rationale)}</div>` : "";

    return `<li>
      <div>${escapeHtml(test.scenario)}</div>
      ${target}
      ${file}
      ${rationale}
    </li>`;
  }
}

function escapeHtml(value: unknown): string {
  const normalized = stringifyValue(value);

  return normalized
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function commandUri(command: string, args?: unknown[]): string {
  const encodedArgs = args ? `?${encodeURIComponent(JSON.stringify(args))}` : "";
  return vscode.Uri.parse(`command:${command}${encodedArgs}`).toString();
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

function parseChangeLike(item: unknown): { filePath?: string; message?: string } | undefined {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;
    return {
      filePath: asString(record.file ?? record.filePath),
      message: asString(record.change ?? record.changes ?? record.message)
    };
  }

  if (typeof item !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(item) as Record<string, unknown>;
    return {
      filePath: asString(parsed.file ?? parsed.filePath),
      message: asString(parsed.change ?? parsed.changes ?? parsed.message)
    };
  } catch {
    return undefined;
  }
}

function parseFilePathLike(item: unknown): string | undefined {
  if (typeof item !== "string") {
    return undefined;
  }

  const trimmed = item.trim();
  return trimmed.includes("/") || trimmed.includes("\\") ? trimmed : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function baseName(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function formatLocation(filePath?: string, line?: number): string | undefined {
  if (filePath && typeof line === "number") {
    return `${filePath}:${line}`;
  }

  return filePath;
}

function isPathOnlyArea(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.includes("/") || trimmed.includes("\\");
}
