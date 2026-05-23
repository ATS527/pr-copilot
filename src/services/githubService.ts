import type { PullRequestDetails, PullRequestSummary } from "../models/pr";
import type { PipelineCheck, PullRequestIssue, PullRequestReviewCommentDraft, SecurityFinding } from "../models/workflow";

export interface GitHubRepositoryRef {
  host: string;
  owner: string;
  repo: string;
  apiBaseUrl: string;
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
  async listPullRequests(repository: GitHubRepositoryRef, token?: string, query?: string): Promise<PullRequestSummary[]> {
    if (query?.trim()) {
      const response = await this.request<GitHubSearchPullRequestsResponse>(
        repository,
        `/search/issues?q=${encodeURIComponent(`repo:${repository.owner}/${repository.repo} is:pr is:open ${query}`)}`,
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

    const prs = await this.request<GitHubPullRequest[]>(repository, `/repos/${repository.owner}/${repository.repo}/pulls`, token);
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

  async listIssues(repository: GitHubRepositoryRef, token?: string): Promise<PullRequestIssue[]> {
    const issues = await this.request<GitHubIssue[]>(repository, `/repos/${repository.owner}/${repository.repo}/issues`, token);
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

  async listCheckRuns(repository: GitHubRepositoryRef, ref: string, token?: string): Promise<PipelineCheck[]> {
    const response = await this.request<GitHubCheckRunsResponse>(
      repository,
      `/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(ref)}/check-runs`,
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

  async listSecurityFindings(repository: GitHubRepositoryRef, prNumber: number, token?: string): Promise<SecurityFinding[]> {
    const alerts = await this.request<GitHubCodeScanningAlert[]>(
      repository,
      `/repos/${repository.owner}/${repository.repo}/code-scanning/alerts?pr=${prNumber}`,
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

  async getPullRequest(repository: GitHubRepositoryRef, number: number, token?: string): Promise<PullRequestDetails> {
    const [pr, files] = await Promise.all([
      this.request<GitHubPullRequest>(repository, `/repos/${repository.owner}/${repository.repo}/pulls/${number}`, token),
      this.request<GitHubPullRequestFile[]>(
        repository,
        `/repos/${repository.owner}/${repository.repo}/pulls/${number}/files`,
        token
      )
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

  async mergePullRequest(repository: GitHubRepositoryRef, number: number, token?: string): Promise<void> {
    await this.request<void>(repository, `/repos/${repository.owner}/${repository.repo}/pulls/${number}/merge`, token, {}, "PUT", {
      merge_method: "merge"
    });
  }

  async closePullRequest(repository: GitHubRepositoryRef, number: number, token?: string): Promise<void> {
    await this.request<void>(repository, `/repos/${repository.owner}/${repository.repo}/pulls/${number}`, token, {}, "PATCH", {
      state: "closed"
    });
  }

  async createPullRequest(
    repository: GitHubRepositoryRef,
    input: { title: string; body?: string; head: string; base: string; draft?: boolean },
    token?: string
  ): Promise<PullRequestSummary> {
    const pr = await this.request<GitHubPullRequest>(repository, `/repos/${repository.owner}/${repository.repo}/pulls`, token, {}, "POST", input);
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
    repository: GitHubRepositoryRef,
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
      await this.request<void>(repository, `/repos/${repository.owner}/${repository.repo}/issues/${number}`, token, {}, "PATCH", {
        ...(input.labels ? { labels: input.labels } : {}),
        ...(input.assignees ? { assignees: input.assignees } : {}),
        ...(typeof input.milestone !== "undefined" ? { milestone: input.milestone } : {})
      });
    }

    if (input.reviewers) {
      await this.request<void>(repository, `/repos/${repository.owner}/${repository.repo}/pulls/${number}/requested_reviewers`, token, {}, "POST", {
        reviewers: input.reviewers
      });
    }
  }

  async submitReview(
    repository: GitHubRepositoryRef,
    number: number,
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
    body: string,
    comments: PullRequestReviewCommentDraft[],
    token?: string
  ): Promise<void> {
    await this.request<void>(repository, `/repos/${repository.owner}/${repository.repo}/pulls/${number}/reviews`, token, {}, "POST", {
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
    repository: GitHubRepositoryRef,
    pathname: string,
    token?: string,
    extraHeaders: Record<string, string> = {},
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${repository.apiBaseUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "pull-request-review-vscode",
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
    const parsed = parseRemoteUrl(normalized);
    if (!parsed) {
      return undefined;
    }

    const [owner, repo, ...rest] = parsed.pathSegments;
    if (!owner || !repo || rest.length > 0) {
      return undefined;
    }

    return {
      host: parsed.host,
      owner,
      repo,
      apiBaseUrl: getGitHubApiBaseUrl(parsed.host)
    };
  }
}

function parseRemoteUrl(remoteUrl: string): { host: string; pathSegments: string[] } | undefined {
  const sshLikeMatch = remoteUrl.match(/^git@(?<host>[^:]+):(?<path>.+)$/);
  if (sshLikeMatch?.groups) {
    return {
      host: sshLikeMatch.groups.host,
      pathSegments: splitRepoPath(sshLikeMatch.groups.path)
    };
  }

    try {
      const parsed = new URL(remoteUrl);
      return {
        host: parsed.host,
        pathSegments: splitRepoPath(parsed.pathname)
      };
  } catch {
    return undefined;
  }
}

function splitRepoPath(pathname: string): string[] {
  return pathname
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
}

function getGitHubApiBaseUrl(host: string): string {
  if (host.toLowerCase() === "github.com") {
    return "https://api.github.com";
  }

  return `https://${host}/api/v3`;
}
