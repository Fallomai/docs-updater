import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewState } from "../types";
import { Octokit } from "@octokit/rest";

interface GetCommitInfoParams {
  owner: string;
  repo: string;
  pull_number: number;
}

interface CommitInfo {
  files: Array<{
    path: string;
    diff: string;
    type: "added" | "modified" | "deleted";
  }>;
  title: string;
  description: string;
  base_branch: string;
  head_branch: string;
}

export const getCommitInfo = createAction({
  id: "getCommitInfo",
  description: "Get information about changes in a PR or commit",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner" },
      repo: { type: "string", description: "Repository name" },
      pull_number: { type: "number", description: "PR number" },
    },
    required: ["owner", "repo", "pull_number"],
  },
  async run(
    context: SpinAiContext,
    parameters?: Record<string, unknown>
  ): Promise<SpinAiContext> {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const state = context.state as ReviewState;

    // Get PR details
    const { data: pr } = await octokit.pulls.get({
      owner: parameters?.owner as string,
      repo: parameters?.repo as string,
      pull_number: parameters?.pull_number as number,
    });

    // Get changed files
    const { data: files } = await octokit.pulls.listFiles({
      owner: parameters?.owner as string,
      repo: parameters?.repo as string,
      pull_number: parameters?.pull_number as number,
    });

    const commitInfo: CommitInfo = {
      files: files.map((file) => ({
        path: file.filename,
        diff: file.patch || "",
        type:
          file.status === "added"
            ? "added"
            : file.status === "removed"
            ? "deleted"
            : "modified",
      })),
      title: pr.title,
      description: pr.body || "",
      base_branch: pr.base.ref,
      head_branch: pr.head.ref,
    };

    // Store in state
    state.commitInfo = commitInfo;

    return context;
  },
});
