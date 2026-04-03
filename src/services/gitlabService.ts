import type { PullRequestDetails, PullRequestSummary } from "../models/pr";

export class GitLabService {
  async listPullRequests(project: string): Promise<PullRequestSummary[]> {
    void project;
    return [];
  }

  async getPullRequest(project: string, id: string): Promise<PullRequestDetails> {
    void project;
    void id;
    throw new Error("GitLab support is planned but not implemented yet.");
  }
}
