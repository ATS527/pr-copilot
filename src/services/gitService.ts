import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PullRequestDetails } from "../models/pr";
import { requireWorkspaceRoot } from "../utils/workspace";

const execFileAsync = promisify(execFile);

export interface WorkingTreeStatus {
  isClean: boolean;
  summary: string;
}

export interface CheckoutResult {
  previousBranch?: string;
  checkedOutBranch: string;
}

export class GitService {
  async getOriginUrl(): Promise<string> {
    const { stdout } = await this.runGit(["remote", "get-url", "origin"]);
    return stdout.trim();
  }

  async getCurrentBranch(): Promise<string> {
    const { stdout } = await this.runGit(["branch", "--show-current"]);
    return stdout.trim();
  }

  async getWorkingTreeStatus(): Promise<WorkingTreeStatus> {
    const { stdout } = await this.runGit(["status", "--short"]);
    return {
      isClean: stdout.trim().length === 0,
      summary: stdout.trim()
    };
  }

  async checkoutPullRequest(pr: PullRequestDetails): Promise<CheckoutResult> {
    const previousBranch = await this.getCurrentBranch();
    const localBranch = `pr-copilot/pr-${pr.number}`;
    const originUrl = await this.getOriginUrl();
    const fetchSource = this.resolveFetchSource(pr, originUrl);

    await this.runGit(["fetch", "--no-tags", "--force", fetchSource, pr.sourceBranch]);
    await this.runGit(["checkout", "-B", localBranch, "FETCH_HEAD"]);

    return {
      previousBranch,
      checkedOutBranch: localBranch
    };
  }

  async restoreBranch(branch: string): Promise<void> {
    await this.runGit(["checkout", branch]);
  }

  async readFileAtRef(ref: string, filePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.runGit(["show", `${ref}:${filePath}`], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024
      });
      return stdout;
    } catch (error) {
      if (isMissingPathError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async runGit(
    args: string[],
    options?: { encoding?: BufferEncoding; maxBuffer?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync("git", args, {
      encoding: options?.encoding ?? "utf8",
      maxBuffer: options?.maxBuffer,
      cwd: requireWorkspaceRoot()
    });
  }

  private resolveFetchSource(pr: PullRequestDetails, originUrl: string): string {
    const normalizedOrigin = originUrl.trim().replace(/\.git$/, "");
    const normalizedHeadClone = pr.headRepository?.cloneUrl?.trim().replace(/\.git$/, "");
    const normalizedHeadSsh = pr.headRepository?.sshUrl?.trim().replace(/\.git$/, "");

    if (
      pr.headRepository?.fullName &&
      (normalizedOrigin.endsWith(`/${pr.headRepository.fullName}`) ||
        normalizedOrigin.endsWith(`:${pr.headRepository.fullName}`))
    ) {
      return "origin";
    }

    if (originUrl.startsWith("git@") && normalizedHeadSsh) {
      return normalizedHeadSsh;
    }

    if (normalizedHeadClone) {
      return normalizedHeadClone;
    }

    throw new Error("Could not determine the PR source repository for checkout.");
  }
}

function isMissingPathError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { stderr?: string; stdout?: string; message?: string };
  const combined = `${candidate.stderr ?? ""}\n${candidate.stdout ?? ""}\n${candidate.message ?? ""}`;

  return (
    combined.includes("exists on disk, but not in") ||
    combined.includes("does not exist in") ||
    combined.includes("pathspec") ||
    combined.includes("fatal: Path")
  );
}
