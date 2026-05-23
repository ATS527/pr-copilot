import type { PullRequestDetails, PullRequestSummary } from "../models/pr";
import type { PipelineCheck, PullRequestIssue, PullRequestReviewCommentDraft, SecurityFinding } from "../models/workflow";

export interface GitLabRepositoryRef {
  host: string;
  projectPath: string;
}

interface GitLabMergeRequest {
  iid: number;
  title: string;
  description: string | null;
  updated_at: string;
  source_branch: string;
  target_branch: string;
  state: string;
  author: { username: string };
  diff_refs?: { base_sha?: string; head_sha?: string };
  sha?: string;
  web_url?: string;
  changes?: GitLabChange[];
}

interface GitLabChange {
  old_path: string;
  new_path: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
  diff?: string;
}

interface GitLabIssue {
  iid: number;
  title: string;
  state: "opened" | "closed";
  updated_at: string;
  web_url: string;
  author: { username: string };
}

interface GitLabPipeline {
  id: number;
  status: string;
  web_url?: string;
}

interface GitLabVulnerability {
  id: number;
  severity?: string;
  state?: string;
  title?: string;
  description?: string;
  location?: {
    file?: string;
    start_line?: number;
  };
  web_url?: string;
}

export class GitLabService {
  async listPullRequests(repository: GitLabRepositoryRef, token?: string): Promise<PullRequestSummary[]> {
    const mergeRequests = await this.request<GitLabMergeRequest[]>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests?state=opened`,
      token
    );
    return mergeRequests.map((mr) => ({
      id: String(mr.iid),
      number: mr.iid,
      title: mr.title,
      author: mr.author.username,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      updatedAt: mr.updated_at,
      provider: "gitlab"
    }));
  }

  async getPullRequest(repository: GitLabRepositoryRef, iid: number, token?: string): Promise<PullRequestDetails> {
    const mr = await this.request<GitLabMergeRequest>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}/changes`,
      token
    );

    return {
      id: String(mr.iid),
      number: mr.iid,
      title: mr.title,
      author: mr.author.username,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      updatedAt: mr.updated_at,
      provider: "gitlab",
      body: mr.description ?? undefined,
      headSha: mr.diff_refs?.head_sha ?? mr.sha,
      baseSha: mr.diff_refs?.base_sha,
      files: (mr.changes ?? []).map((change) => ({
        path: change.new_path,
        previousPath: change.old_path !== change.new_path ? change.old_path : undefined,
        status: change.new_file
          ? "added"
          : change.deleted_file
            ? "deleted"
            : change.renamed_file
              ? "renamed"
              : "modified",
        additions: 0,
        deletions: 0,
        patch: change.diff
      }))
    };
  }

  async listIssues(repository: GitLabRepositoryRef, token?: string): Promise<PullRequestIssue[]> {
    const issues = await this.request<GitLabIssue[]>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/issues?state=opened`,
      token
    );
    return issues.map((issue) => ({
      id: String(issue.iid),
      number: issue.iid,
      title: issue.title,
      author: issue.author.username,
      updatedAt: issue.updated_at,
      state: issue.state === "opened" ? "open" : "closed",
      url: issue.web_url
    }));
  }

  async listCheckRuns(repository: GitLabRepositoryRef, iid: number, token?: string): Promise<PipelineCheck[]> {
    const pipelines = await this.request<GitLabPipeline[]>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}/pipelines`,
      token
    );
    return pipelines.map((pipeline) => ({
      id: pipeline.id,
      name: `Pipeline #${pipeline.id}`,
      status: pipeline.status,
      conclusion: pipeline.status,
      detailsUrl: pipeline.web_url
    }));
  }

  async listSecurityFindings(repository: GitLabRepositoryRef, token?: string): Promise<SecurityFinding[]> {
    try {
      const vulnerabilities = await this.request<GitLabVulnerability[]>(
        repository,
        `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/vulnerabilities`,
        token
      );
      return vulnerabilities.map((finding) => ({
        id: String(finding.id),
        severity: finding.severity,
        state: finding.state,
        description: finding.title ?? finding.description ?? "Security finding",
        filePath: finding.location?.file,
        line: finding.location?.start_line,
        htmlUrl: finding.web_url
      }));
    } catch {
      return [];
    }
  }

  async createPullRequest(
    repository: GitLabRepositoryRef,
    input: { title: string; body?: string; head: string; base: string },
    token?: string
  ): Promise<PullRequestSummary> {
    const mr = await this.request<GitLabMergeRequest>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests`,
      token,
      "POST",
      {
        title: input.title,
        description: input.body,
        source_branch: input.head,
        target_branch: input.base
      }
    );
    return {
      id: String(mr.iid),
      number: mr.iid,
      title: mr.title,
      author: mr.author.username,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      updatedAt: mr.updated_at,
      provider: "gitlab"
    };
  }

  async mergePullRequest(repository: GitLabRepositoryRef, iid: number, token?: string): Promise<void> {
    await this.request<void>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}/merge`,
      token,
      "PUT"
    );
  }

  async closePullRequest(repository: GitLabRepositoryRef, iid: number, token?: string): Promise<void> {
    await this.request<void>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}`,
      token,
      "PUT",
      { state_event: "close" }
    );
  }

  async updatePullRequestMetadata(
    repository: GitLabRepositoryRef,
    iid: number,
    input: { labels?: string[]; assignees?: string[]; milestone?: number | null; reviewers?: string[] },
    token?: string
  ): Promise<void> {
    await this.request<void>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}`,
      token,
      "PUT",
      {
        ...(input.labels ? { labels: input.labels.join(",") } : {}),
        ...(typeof input.milestone !== "undefined" ? { milestone_id: input.milestone } : {}),
        ...(input.assignees ? { assignee_ids: [] } : {}),
        ...(input.reviewers ? { reviewer_ids: [] } : {})
      }
    );
  }

  async submitReview(
    repository: GitLabRepositoryRef,
    iid: number,
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
    body: string,
    comments: PullRequestReviewCommentDraft[],
    token?: string
  ): Promise<void> {
    const commentsBlock =
      comments.length > 0
        ? `\n\nPending review comments:\n${comments.map((comment) => `- ${comment.path}:${comment.line} ${comment.body}`).join("\n")}`
        : "";

    await this.request<void>(
      repository,
      `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}/notes`,
      token,
      "POST",
      {
        body: `${body}${commentsBlock}`.trim() || "Review submitted from Pull Request Review."
      }
    );

    if (event === "APPROVE") {
      await this.request<void>(
        repository,
        `/api/v4/projects/${encodeURIComponent(repository.projectPath)}/merge_requests/${iid}/approve`,
        token,
        "POST"
      );
    }
  }

  static parseRepository(remoteUrl: string): GitLabRepositoryRef | undefined {
    const normalized = remoteUrl.trim().replace(/\.git$/, "");
    const sshLikeMatch = normalized.match(/^git@(?<host>[^:]+):(?<projectPath>.+)$/);
    if (sshLikeMatch?.groups) {
      return {
        host: sshLikeMatch.groups.host,
        projectPath: sshLikeMatch.groups.projectPath
      };
    }

    try {
      const parsed = new URL(normalized);
      return {
        host: parsed.host,
        projectPath: parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "")
      };
    } catch {
      return undefined;
    }
  }

  private async request<T>(
    repository: GitLabRepositoryRef,
    pathname: string,
    token?: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const baseUrl = `https://${repository.host}`;
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "PRIVATE-TOKEN": token } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`GitLab request failed (${response.status}): ${message}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}
