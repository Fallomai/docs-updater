import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewState } from "../types";
import { Octokit } from "@octokit/rest";

interface ManagePRParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  base_branch?: string;
  labels?: string[];
  original_pr_number?: number;
}

export const managePR = createAction({
  id: "managePR",
  description: "Create or update a documentation PR",
  dependsOn: ["getBranch", "commitChange"], // Ensure we have branch and commits
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner" },
      repo: { type: "string", description: "Repository name" },
      title: { type: "string", description: "PR title" },
      body: { type: "string", description: "PR description" },
      base_branch: { type: "string", description: "Base branch to merge into" },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Labels to add to PR",
      },
      original_pr_number: { type: "number", description: "Original PR number" },
    },
    required: ["owner", "repo", "title", "body"],
  },
  async run(
    context: SpinAiContext,
    parameters?: Record<string, unknown>
  ): Promise<SpinAiContext> {
    console.log("\n=== ManagePR: Starting ===");

    if (!process.env.GITHUB_TOKEN) {
      console.error("GITHUB_TOKEN environment variable is missing");
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
      typeof parameters.title !== "string" ||
      typeof parameters.body !== "string"
    ) {
      console.error("Invalid parameters:", JSON.stringify(parameters, null, 2));
      throw new Error("Missing required parameters");
    }

    const params = {
      owner: parameters.owner,
      repo: parameters.repo,
      title: parameters.title,
      body: parameters.body,
      base_branch: parameters.base_branch as string | undefined,
      labels: parameters.labels as string[] | undefined,
      original_pr_number: parameters.original_pr_number as number | undefined,
    };

    console.log("Parameters:", {
      owner: params.owner,
      repo: params.repo,
      branch: state.branchInfo.name,
      base_branch: params.base_branch,
      original_pr_number: params.original_pr_number,
    });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // First check if we have an existing docs PR
    console.log("\nChecking for existing docs PR...");
    const { data: pulls } = await octokit.pulls.list({
      owner: params.owner,
      repo: params.repo,
      state: "open",
    });
    console.log(`Found ${pulls.length} open PRs`);

    const existingPR = pulls.find(
      (pr) =>
        pr.title.startsWith("📚 Update documentation") &&
        pr.body?.includes(`#${params.original_pr_number}`)
    );

    if (existingPR) {
      console.log(`Found existing PR #${existingPR.number}`);

      // Update existing PR
      console.log("Updating existing PR...");
      await octokit.pulls.update({
        owner: params.owner,
        repo: params.repo,
        pull_number: existingPR.number,
        title: params.title,
        body: params.body,
      });

      // Update labels if specified
      if (params.labels?.length) {
        console.log("Updating labels:", params.labels);
        await octokit.issues.setLabels({
          owner: params.owner,
          repo: params.repo,
          issue_number: existingPR.number,
          labels: params.labels,
        });
      }

      console.log("Existing PR updated successfully");
      return context;
    }

    // Get default branch if not specified
    if (!params.base_branch) {
      console.log("\nFetching default branch...");
      const { data: repo } = await octokit.repos.get({
        owner: params.owner,
        repo: params.repo,
      });
      params.base_branch = repo.default_branch;
      console.log("Using default branch:", params.base_branch);
    }

    // Create new PR
    console.log("\nCreating new PR...");
    try {
      const { data: pr } = await octokit.pulls.create({
        owner: params.owner,
        repo: params.repo,
        title: params.title,
        body: params.body,
        head: state.branchInfo.name,
        base: params.base_branch,
      });
      console.log("PR created successfully:", pr.html_url);

      // Add labels if specified
      if (params.labels?.length) {
        console.log("Adding labels:", params.labels);
        await octokit.issues.addLabels({
          owner: params.owner,
          repo: params.repo,
          issue_number: pr.number,
          labels: params.labels,
        });
      }

      // Add comment to original PR if specified
      if (params.original_pr_number) {
        console.log("Adding comment to original PR...");
        await octokit.issues.createComment({
          owner: params.owner,
          repo: params.repo,
          issue_number: params.original_pr_number,
          body: `I've created a documentation update PR: #${pr.number}`,
        });
      }
    } catch (error) {
      console.error("Error creating PR:", error);
      throw error;
    }

    console.log("\n=== ManagePR: Completed Successfully ===");
    return context;
  },
});
