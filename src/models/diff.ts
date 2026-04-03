import type { PullRequestFile } from "./pr";

export interface DiffTarget {
  baseUri: string;
  headUri: string;
  title: string;
  file: PullRequestFile;
}
