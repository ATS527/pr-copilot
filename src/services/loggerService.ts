import * as vscode from "vscode";

export class LoggerService {
  private readonly outputChannel = vscode.window.createOutputChannel("PR Copilot");

  info(message: string): void {
    this.outputChannel.appendLine(`[INFO] ${message}`);
  }

  error(message: string): void {
    this.outputChannel.appendLine(`[ERROR] ${message}`);
  }

  show(): void {
    this.outputChannel.show(true);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}
