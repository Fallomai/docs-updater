import * as dotenv from "dotenv";
import { createAgent, createOpenAILLM } from "spinai";
import { DocConfig, ReviewState } from "./types";
import { createFullConfig } from "./config";
import { actions } from "./actions";
import { startServer } from "./server";

dotenv.config();

export interface CreateDocUpdateAgentOptions {
  config?: Partial<DocConfig>;
  openAiKey?: string;
  githubToken?: string;
  port?: number;
}

export function createDocUpdateAgent(
  options: CreateDocUpdateAgentOptions = {}
) {
  const config = createFullConfig(options.config || {});

  // Validate required credentials
  const openAiKey = options.openAiKey || process.env.OPENAI_API_KEY;
  const githubToken = options.githubToken || process.env.GITHUB_TOKEN;
  if (!openAiKey) throw new Error("OpenAI API key is required");
  if (!githubToken) throw new Error("GitHub token is required");

  // Create the agent
  const agent = createAgent<ReviewState>({
    instructions: `You are a documentation maintenance agent that helps keep documentation in sync with code changes.
    
    Your goals when handling a pull request are to:
    1. Understand what functionality has changed and its impact
    2. Identify affected documentation and potential gaps
    3. Generate or update documentation to reflect the changes
    4. Ensure changes are properly committed and accessible via PR

    The correct workflow is:
    1. First understand the code changes and find existing docs
    2. Get/create the docs branch before any writes or commits
    3. Generate documentation content one file at a time
    4. Commit the changes
    5. Create or update the PR

    Important considerations:
    - Always get/create the branch before trying to write or commit changes
    - Branch names must be URL-safe (use hyphens instead of slashes or spaces)
    - Generate one documentation file at a time
    - Update navigation (mint.json) when adding new files

    Use your judgment to determine what documentation needs updating based on code changes.`,
    actions,
    llm: createOpenAILLM({
      apiKey: openAiKey,
      model: "gpt-4-turbo-preview",
    }),
    agentId: "mintlify-update-agent",
    // Optional: Enable SpinAI monitoring
    // spinApiKey: process.env.SPINAI_API_KEY,
  });

  return agent;
}

export { startServer } from "./server";
export type { DocConfig } from "./types";
export type { ServerOptions } from "./server";

// Start the server when this file is run directly
if (require.main === module) {
  startServer().catch((error: Error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
