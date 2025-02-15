import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewState } from "../types";
import { Octokit } from "@octokit/rest";

interface GetBranchParams {
  owner: string;
  repo: string;
  original_pr_number?: number;
}

interface BranchInfo {
  name: string;
  sha: string;
  exists: boolean;
}

export const getBranch = createAction({
  id: "getBranch",
  description: "Get or create a documentation PR branch",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner" },
      repo: { type: "string", description: "Repository name" },
      original_pr_number: { type: "number", description: "Original PR number" },
    },
    required: ["owner", "repo"],
  },
  async run(
    context: SpinAiContext,
    parameters?: Record<string, unknown>
  ): Promise<SpinAiContext> {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    if (
      !parameters ||
      typeof parameters.owner !== "string" ||
      typeof parameters.repo !== "string"
    ) {
      throw new Error("Missing or invalid required parameters");
    }

    const params: GetBranchParams = {
      owner: parameters.owner,
      repo: parameters.repo,
      original_pr_number:
        typeof parameters.original_pr_number === "number"
          ? parameters.original_pr_number
          : undefined,
    };

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const state = context.state as ReviewState;

    console.log("\n=== GetBranch: Starting ===");

    // First check if we have an existing docs PR
    console.log("Checking for existing docs PR...");
    if (params.original_pr_number) {
      const { data: pulls } = await octokit.pulls.list({
        owner: params.owner,
        repo: params.repo,
        state: "open",
      });

      const existingPR = pulls.find(
        (pr) =>
          pr.title.startsWith("📚 Update documentation") &&
          pr.body?.includes(`#${params.original_pr_number}`)
      );

      if (existingPR) {
        console.log(
          `Found existing PR #${existingPR.number} using branch ${existingPR.head.ref}`
        );
        const { data: ref } = await octokit.git.getRef({
          owner: params.owner,
          repo: params.repo,
          ref: `heads/${existingPR.head.ref}`,
        });

        const branchInfo: BranchInfo = {
          name: existingPR.head.ref,
          sha: ref.object.sha,
          exists: true,
        };

        return {
          ...context,
          state: {
            ...state,
            branchInfo,
          },
        };
      }
    }

    // No existing PR, create new branch
    console.log("No existing PR found, will create new branch");

    // Get default branch
    const { data: repo } = await octokit.repos.get({
      owner: params.owner,
      repo: params.repo,
    });
    const baseBranch = repo.default_branch;
    console.log("Using default branch:", baseBranch);

    // Generate branch name
    const branchName = params.original_pr_number
      ? `docs/update-pr-${params.original_pr_number}`
      : `docs/update-${Date.now()}`;
    console.log("New branch name:", branchName);

    // Create new branch
    const { data: ref } = await octokit.git.getRef({
      owner: params.owner,
      repo: params.repo,
      ref: `heads/${baseBranch}`,
    });

    await octokit.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });

    console.log("Created new branch from", baseBranch);

    const branchInfo: BranchInfo = {
      name: branchName,
      sha: ref.object.sha,
      exists: true,
    };

    console.log("=== GetBranch: Complete ===");

    return {
      ...context,
      state: {
        ...state,
        branchInfo,
      },
    };
  },
});
