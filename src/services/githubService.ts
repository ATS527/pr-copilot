import type { PullRequestDetails, PullRequestSummary } from "../models/pr";

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

  async listPullRequests(owner: string, repo: string, token?: string): Promise<PullRequestSummary[]> {
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

  private async request<T>(pathname: string, token?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "pr-copilot-vscode",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
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
