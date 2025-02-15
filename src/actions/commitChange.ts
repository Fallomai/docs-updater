import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewState } from "../types";
import { Octokit } from "@octokit/rest";

interface CommitChangeParams {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch: string;
}

export const commitChange = createAction({
  id: "commitChange",
  description: "Commit a documentation change to GitHub",
  dependsOn: ["getBranch"],
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner" },
      repo: { type: "string", description: "Repository name" },
      path: { type: "string", description: "File path to commit" },
      content: { type: "string", description: "File content" },
      message: { type: "string", description: "Commit message" },
    },
    required: ["owner", "repo", "path", "content", "message"],
  },
  async run(
    context: SpinAiContext,
    parameters?: Record<string, unknown>
  ): Promise<SpinAiContext> {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    const state = context.state as ReviewState;
    if (!state.branchInfo?.exists) {
      throw new Error(
        "Branch info not found. Make sure getBranch is called first."
      );
    }

    if (
      !parameters ||
      typeof parameters.owner !== "string" ||
      typeof parameters.repo !== "string" ||
      typeof parameters.path !== "string" ||
      typeof parameters.content !== "string" ||
      typeof parameters.message !== "string"
    ) {
      throw new Error("Missing or invalid required parameters");
    }

    const params: CommitChangeParams = {
      owner: parameters.owner,
      repo: parameters.repo,
      path: parameters.path,
      content: parameters.content,
      message: parameters.message,
      branch: state.branchInfo.name,
    };

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Try to get current file (to get its SHA if it exists)
    let sha: string | undefined;
    try {
      const { data: file } = await octokit.repos.getContent({
        owner: params.owner,
        repo: params.repo,
        path: params.path,
        ref: params.branch,
      });

      if ("sha" in file) {
        sha = file.sha;
      }
    } catch (error) {
      // File doesn't exist, which is fine for new files
    }

    // Create or update the file
    await octokit.repos.createOrUpdateFileContents({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      content: Buffer.from(params.content).toString("base64"),
      branch: params.branch,
      ...(sha ? { sha } : {}),
    });

    return context;
  },
});
