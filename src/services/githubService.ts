import type { PullRequestDetails, PullRequestSummary } from "../models/pr";
import type { PipelineCheck, PullRequestIssue, PullRequestReviewCommentDraft, SecurityFinding } from "../models/workflow";

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
}

export class GitHubAuthenticationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "GitHubAuthenticationError";
  }
}

interface GitHubPullRequest {
  number: number;
  title: string;
  user: { login: string };
  head: { ref: string; sha: string; repo: GitHubRepository | null };
  base: { ref: string; sha: string; repo: GitHubRepository | null };
  updated_at: string;
  body: string | null;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  updated_at: string;
  html_url: string;
  user: { login: string };
  pull_request?: unknown;
}

interface GitHubCheckRunsResponse {
  check_runs: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    details_url?: string | null;
  }>;
}

interface GitHubSearchPullRequestsResponse {
  items: Array<{
    number: number;
    title: string;
    updated_at: string;
    user: { login: string };
  }>;
}

interface GitHubCodeScanningAlert {
  number: number;
  html_url: string;
  state: string;
  rule: {
    id?: string;
    severity?: string;
    description?: string;
  };
  most_recent_instance?: {
    location?: {
      path?: string;
      start_line?: number;
    };
  };
}

interface GitHubRepository {
  name: string;
  full_name: string;
  clone_url: string;
  ssh_url: string;
  owner: {
    login: string;
  };
}

interface GitHubPullRequestFile {
  filename: string;
  previous_filename?: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

export class GitHubService {
  constructor(private readonly baseUrl = "https://api.github.com") {}

  async listPullRequests(owner: string, repo: string, token?: string, query?: string): Promise<PullRequestSummary[]> {
    if (query?.trim()) {
      const response = await this.request<GitHubSearchPullRequestsResponse>(
        `/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} is:pr is:open ${query}`)}`,
        token
      );
      return response.items.map((pr) => ({
        id: String(pr.number),
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        sourceBranch: "",
        targetBranch: "",
        updatedAt: pr.updated_at,
        provider: "github"
      }));
    }

    const prs = await this.request<GitHubPullRequest[]>(`/repos/${owner}/${repo}/pulls`, token);
    return prs.map((pr) => ({
      id: String(pr.number),
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      updatedAt: pr.updated_at,
      provider: "github"
    }));
  }

  async listIssues(owner: string, repo: string, token?: string): Promise<PullRequestIssue[]> {
    const issues = await this.request<GitHubIssue[]>(`/repos/${owner}/${repo}/issues`, token);
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        id: String(issue.number),
        number: issue.number,
        title: issue.title,
        author: issue.user.login,
        updatedAt: issue.updated_at,
        state: issue.state,
        url: issue.html_url
      }));
  }

  async listCheckRuns(owner: string, repo: string, ref: string, token?: string): Promise<PipelineCheck[]> {
    const response = await this.request<GitHubCheckRunsResponse>(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs`,
      token,
      { Accept: "application/vnd.github+json" }
    );
    return response.check_runs.map((check) => ({
      id: check.id,
      name: check.name,
      status: check.status,
      conclusion: check.conclusion ?? undefined,
      detailsUrl: check.details_url ?? undefined
    }));
  }

  async listSecurityFindings(owner: string, repo: string, prNumber: number, token?: string): Promise<SecurityFinding[]> {
    const alerts = await this.request<GitHubCodeScanningAlert[]>(
      `/repos/${owner}/${repo}/code-scanning/alerts?pr=${prNumber}`,
      token
    );
    return alerts.map((alert) => ({
      id: String(alert.number),
      ruleId: alert.rule.id,
      severity: alert.rule.severity,
      state: alert.state,
      description: alert.rule.description ?? "Security finding",
      filePath: alert.most_recent_instance?.location?.path,
      line: alert.most_recent_instance?.location?.start_line,
      htmlUrl: alert.html_url
    }));
  }

  async getPullRequest(owner: string, repo: string, number: number, token?: string): Promise<PullRequestDetails> {
    const [pr, files] = await Promise.all([
      this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${number}`, token),
      this.request<GitHubPullRequestFile[]>(`/repos/${owner}/${repo}/pulls/${number}/files`, token)
    ]);

    return {
      id: String(pr.number),
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      updatedAt: pr.updated_at,
      provider: "github",
      body: pr.body ?? undefined,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      headRepository: pr.head.repo
        ? {
            owner: pr.head.repo.owner.login,
            name: pr.head.repo.name,
            fullName: pr.head.repo.full_name,
            cloneUrl: pr.head.repo.clone_url,
            sshUrl: pr.head.repo.ssh_url
          }
        : undefined,
      baseRepository: pr.base.repo
        ? {
            owner: pr.base.repo.owner.login,
            name: pr.base.repo.name,
            fullName: pr.base.repo.full_name,
            cloneUrl: pr.base.repo.clone_url,
            sshUrl: pr.base.repo.ssh_url
          }
        : undefined,
      files: files.map((file) => ({
        path: file.filename,
        previousPath: file.previous_filename,
        status: file.status === "removed" ? "deleted" : file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      }))
    };
  }

  async mergePullRequest(owner: string, repo: string, number: number, token?: string): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}/pulls/${number}/merge`, token, {}, "PUT", {
      merge_method: "merge"
    });
  }

  async closePullRequest(owner: string, repo: string, number: number, token?: string): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}/pulls/${number}`, token, {}, "PATCH", {
      state: "closed"
    });
  }

  async createPullRequest(
    owner: string,
    repo: string,
    input: { title: string; body?: string; head: string; base: string; draft?: boolean },
    token?: string
  ): Promise<PullRequestSummary> {
    const pr = await this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls`, token, {}, "POST", input);
    return {
      id: String(pr.number),
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      updatedAt: pr.updated_at,
      provider: "github"
    };
  }

  async updatePullRequestMetadata(
    owner: string,
    repo: string,
    number: number,
    input: {
      labels?: string[];
      assignees?: string[];
      milestone?: number | null;
      reviewers?: string[];
    },
    token?: string
  ): Promise<void> {
    if (input.labels || input.assignees || typeof input.milestone !== "undefined") {
      await this.request<void>(`/repos/${owner}/${repo}/issues/${number}`, token, {}, "PATCH", {
        ...(input.labels ? { labels: input.labels } : {}),
        ...(input.assignees ? { assignees: input.assignees } : {}),
        ...(typeof input.milestone !== "undefined" ? { milestone: input.milestone } : {})
      });
    }

    if (input.reviewers) {
      await this.request<void>(`/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, token, {}, "POST", {
        reviewers: input.reviewers
      });
    }
  }

  async submitReview(
    owner: string,
    repo: string,
    number: number,
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
    body: string,
    comments: PullRequestReviewCommentDraft[],
    token?: string
  ): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}/pulls/${number}/reviews`, token, {}, "POST", {
      event,
      body,
      comments: comments.map((comment) => ({
        path: comment.path,
        line: comment.line,
        side: "RIGHT",
        body: comment.body
      }))
    });
  }

  private async request<T>(
    pathname: string,
    token?: string,
    extraHeaders: Record<string, string> = {},
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "pr-copilot-vscode",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    if (!response.ok) {
      const message = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new GitHubAuthenticationError(
          `GitHub request failed (${response.status}). Check that your token is valid and has repository access.`,
          response.status
        );
      }
      throw new Error(`GitHub request failed (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }

  static parseRepository(remoteUrl: string): GitHubRepositoryRef | undefined {
    const normalized = remoteUrl.trim().replace(/\.git$/, "");
    const match = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/);
    if (!match?.groups) {
      return undefined;
    }

    return {
      owner: match.groups.owner,
      repo: match.groups.repo
    };
  }
}
