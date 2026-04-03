import * as vscode from "vscode";
import type { ReviewInsights } from "../models/insight";
import type { PullRequestDetails } from "../models/pr";

export class InsightsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "prCopilot.insights";

  private view?: vscode.WebviewView;
  private pr?: PullRequestDetails;
  private insights?: ReviewInsights;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: false };
    this.render();
  }

  update(pr: PullRequestDetails | undefined, insights: ReviewInsights | undefined): void {
    this.pr = pr;
    this.insights = insights;
    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }

    const title = this.pr ? `PR #${this.pr.number}: ${this.pr.title}` : "No pull request selected";
    const summary = this.insights?.summary?.overview ?? "AI summary will appear here.";
    const risks = this.insights?.risks ?? [];
    const tests = this.insights?.tests ?? [];

    this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
  <body style="font-family: var(--vscode-font-family); padding: 12px;">
    <h2>${escapeHtml(title)}</h2>
    <section>
      <h3>Summary</h3>
      <p>${escapeHtml(summary)}</p>
    </section>
    <section>
      <h3>Risks</h3>
      ${risks.length > 0 ? `<ul>${risks
        .map((risk) => `<li><strong>${escapeHtml(risk.severity.toUpperCase())}</strong>: ${escapeHtml(risk.title)}</li>`)
        .join("")}</ul>` : "<p>No risks yet.</p>"}
    </section>
    <section>
      <h3>Tests</h3>
      ${tests.length > 0 ? `<ul>${tests
        .map((test) => `<li>${escapeHtml(test.scenario)}</li>`)
        .join("")}</ul>` : "<p>No test suggestions yet.</p>"}
    </section>
  </body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
