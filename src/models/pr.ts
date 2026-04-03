export type ProviderType = "github" | "gitlab";

export interface PullRequestSummary {
  id: string;
  number: number;
  title: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  updatedAt: string;
  provider: ProviderType;
}

export interface PullRequestDetails extends PullRequestSummary {
  body?: string;
  headSha?: string;
  baseSha?: string;
  headRepository?: PullRequestRepository;
  baseRepository?: PullRequestRepository;
  files: PullRequestFile[];
}

export interface PullRequestRepository {
  owner: string;
  name: string;
  fullName: string;
  cloneUrl?: string;
  sshUrl?: string;
}

export interface PullRequestFile {
  path: string;
  previousPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ReviewSession {
  pr: PullRequestDetails;
  previousBranch?: string;
  checkedOutBranch?: string;
}
