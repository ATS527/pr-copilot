import * as vscode from "vscode";
import type { PullRequestSummary } from "../models/pr";
import { GitHubAuthenticationError, GitHubService } from "../services/githubService";
import { GitService } from "../services/gitService";
import { GitLabService, type GitLabRepositoryRef } from "../services/gitlabService";
import { SecretService } from "../services/secretService";

export interface OpenPrDependencies {
  githubService: GitHubService;
  gitService: GitService;
  gitlabService: GitLabService;
  secretService: SecretService;
  configuration: vscode.WorkspaceConfiguration;
}

export interface OpenPrResult {
  pullRequests: PullRequestSummary[];
  selected: PullRequestSummary;
  repository:
    | {
        provider: "github";
        host: string;
        owner: string;
        repo: string;
        apiBaseUrl: string;
      }
    | ({
        provider: "gitlab";
      } & GitLabRepositoryRef);
}

export async function openPr(dependencies: OpenPrDependencies): Promise<OpenPrResult | undefined> {
  const provider = dependencies.configuration.get<"github" | "gitlab">("provider", "github");
  const requireToken = dependencies.configuration.get<boolean>("github.requireToken", false);
  const query = dependencies.configuration.get<string>("github.pullRequestQuery", "");

  if (provider === "gitlab") {
    const remoteUrl = await dependencies.gitService.getOriginUrl();
    const repository = GitLabService.parseRepository(remoteUrl);
    if (!repository) {
      throw new Error("Could not detect a GitLab repository from the current workspace.");
    }

    let token = await dependencies.secretService.getGitLabToken();
    if (!token) {
      token = await dependencies.secretService.ensureGitLabToken();
    }

    const pullRequests = await dependencies.gitlabService.listPullRequests(repository, token);
    if (pullRequests.length === 0) {
      await vscode.window.showInformationMessage("No open merge requests found for this repository.");
      return undefined;
    }

    const selection = await vscode.window.showQuickPick(
      pullRequests.map((pr) => ({
        label: `!${pr.number} ${pr.title}`,
        description: `${pr.author} -> ${pr.targetBranch}`,
        pr
      })),
      {
        title: "Select a merge request to review"
      }
    );

    if (!selection) {
      return undefined;
    }

    return {
      pullRequests,
      selected: selection.pr,
      repository: {
        provider: "gitlab",
        ...repository
      }
    };
  }

  const remoteUrl = await dependencies.gitService.getOriginUrl();
  const repository = GitHubService.parseRepository(remoteUrl);
  if (!repository) {
    throw new Error("Could not detect a GitHub repository from the current workspace.");
  }

  let token = await dependencies.secretService.getGitHubToken();
  if (requireToken && !token) {
    token = await dependencies.secretService.ensureGitHubToken();
    if (!token) {
      throw new Error("A GitHub token is required to fetch pull requests.");
    }
  }

  let pullRequests: PullRequestSummary[];
  try {
    pullRequests = await dependencies.githubService.listPullRequests(repository, token, query);
  } catch (error) {
    if (error instanceof GitHubAuthenticationError) {
      token = await dependencies.secretService.ensureGitHubToken({ forcePrompt: true });
      if (!token) {
        throw new Error("GitHub token entry was cancelled.");
      }
      pullRequests = await dependencies.githubService.listPullRequests(repository, token, query);
    } else {
      throw error;
    }
  }
  if (pullRequests.length === 0) {
    await vscode.window.showInformationMessage("No open pull requests found for this repository.");
    return undefined;
  }

  const selection = await vscode.window.showQuickPick(
    pullRequests.map((pr) => ({
      label: `#${pr.number} ${pr.title}`,
      description: `${pr.author} -> ${pr.targetBranch}`,
      pr
    })),
    {
      title: "Select a pull request to review"
    }
  );

  if (!selection) {
    return undefined;
  }

  return {
    pullRequests,
    selected: selection.pr,
    repository: {
      provider: "github",
      ...repository
    }
  };
}
