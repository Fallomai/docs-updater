import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewState } from "../types";
import { Octokit } from "@octokit/rest";

interface FindDocumentationParams {
  owner: string;
  repo: string;
  pull_number: number;
  paths: string[];
}

export const findDocumentation = createAction({
  id: "findDocumentation",
  description: "Find existing documentation and PRs for given files/features",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner" },
      repo: { type: "string", description: "Repository name" },
      pull_number: { type: "number", description: "PR number" },
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Paths to find documentation for",
      },
    },
    required: ["owner", "repo", "pull_number", "paths"],
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
    const { owner, repo, pull_number, paths } =
      parameters as FindDocumentationParams;

    // Find existing docs PR first
    const { data: pulls } = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
    });

    const docsPR = pulls.find(
      (pr) =>
        pr.title.startsWith("📚 Update documentation") &&
        pr.body?.includes(`#${pull_number}`)
    );

    let existingPR;
    if (docsPR) {
      const { data: files } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: docsPR.number,
      });

      existingPR = {
        number: docsPR.number,
        branch: docsPR.head.ref,
        files: await Promise.all(
          files.map(async (file) => {
            try {
              const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: file.filename,
                ref: docsPR.head.ref,
              });

              if ("content" in data) {
                return {
                  path: file.filename,
                  content: Buffer.from(data.content, "base64").toString(
                    "utf-8"
                  ),
                };
              }
            } catch (error) {
              console.log(`Could not get content for ${file.filename}`);
            }
            return {
              path: file.filename,
              content: "",
            };
          })
        ),
      };
    }

    // Find existing documentation files
    const docFiles = await Promise.all(
      paths.map(async (path) => {
        const docPath = path
          .replace(/^src\//, "docs/")
          .replace(/\.[jt]sx?$/, ".mdx");

        try {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: docPath,
            ref: "main", // or state.config.docsBranch
          });

          if ("content" in data) {
            return {
              path: docPath,
              content: Buffer.from(data.content, "base64").toString("utf-8"),
              type: "doc" as const,
              lastModified: data.sha,
            };
          }
        } catch (error) {
          // File doesn't exist, which is fine
        }

        return {
          path: docPath,
          content: null,
          type: "doc" as const,
        };
      })
    );

    // Also check mint.json for navigation
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: "mint.json",
        ref: "main", // or state.config.docsBranch
      });

      if ("content" in data) {
        docFiles.push({
          path: "mint.json",
          content: Buffer.from(data.content, "base64").toString("utf-8"),
          type: "navigation" as const,
          lastModified: data.sha,
        });
      }
    } catch (error) {
      docFiles.push({
        path: "mint.json",
        content: null,
        type: "navigation" as const,
      });
    }

    // Store in state
    state.docInfo = {
      files: docFiles,
      existingPR,
    };

    return context;
  },
});
