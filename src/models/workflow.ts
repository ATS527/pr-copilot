export interface PullRequestReviewCommentDraft {
  id: string;
  path: string;
  line: number;
  body: string;
}

export interface PullRequestIssue {
  id: string;
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  state: "open" | "closed";
  url: string;
}

export interface PipelineCheck {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  detailsUrl?: string;
}

export interface SecurityFinding {
  id: string;
  ruleId?: string;
  severity?: string;
  state?: string;
  description: string;
  filePath?: string;
  line?: number;
  htmlUrl?: string;
}
