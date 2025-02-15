import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewState } from "../types";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";

interface WriteDocumentationParams {
  path: string;
  type: "doc" | "navigation";
  context?: {
    related_files?: string[];
    code_changes?: string;
    category?: string;
    template_paths?: string[]; // Explicit templates to follow
    update_type: "create" | "update";
    reason?: string; // Why this file needs updating
  };
}

async function findSimilarDocs(
  octokit: Octokit,
  path: string,
  category: string,
  templatePaths: string[] | undefined,
  state: ReviewState
): Promise<string[]> {
  // If template paths provided, use those first
  if (templatePaths?.length) {
    const templates =
      state.docInfo?.files.filter(
        (file) => templatePaths.includes(file.path) && file.content
      ) || [];
    if (templates.length) {
      return templates.map((doc) => doc.content as string);
    }
  }

  // Otherwise find by category
  const similarDocs =
    state.docInfo?.files.filter(
      (file) =>
        file.type === "doc" &&
        file.content &&
        file.path !== path &&
        file.path.includes(`/${category}/`)
    ) || [];

  return similarDocs.map((doc) => doc.content as string);
}

export const writeDocumentation = createAction({
  id: "writeDocumentation",
  description: "Generate or update documentation content",
  dependsOn: ["getBranch"],
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to write documentation to" },
      type: {
        type: "string",
        enum: ["doc", "navigation"],
        description: "Type of documentation",
      },
      context: {
        type: "object",
        properties: {
          related_files: { type: "array", items: { type: "string" } },
          code_changes: { type: "string" },
          category: { type: "string" },
          template_paths: { type: "array", items: { type: "string" } },
          update_type: { type: "string", enum: ["create", "update"] },
          reason: { type: "string" },
        },
      },
    },
    required: ["path", "type"],
  },
  async run(
    context: SpinAiContext,
    parameters?: Record<string, unknown>
  ): Promise<SpinAiContext> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    if (
      !parameters ||
      typeof parameters.path !== "string" ||
      typeof parameters.type !== "string" ||
      !["doc", "navigation"].includes(parameters.type)
    ) {
      throw new Error("Missing or invalid required parameters");
    }

    const state = context.state as ReviewState;
    const params = {
      path: parameters.path,
      type: parameters.type as "doc" | "navigation",
      context: parameters.context as WriteDocumentationParams["context"],
    };

    // Validate file extension for docs
    if (params.type === "doc") {
      const fileExt = params.path.substring(params.path.lastIndexOf("."));
      if (!state.config.matchRules.docExtensions.includes(fileExt)) {
        throw new Error(
          `Invalid file extension "${fileExt}". Allowed extensions: ${state.config.matchRules.docExtensions.join(
            ", "
          )}`
        );
      }
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Find existing content and similar docs
    const existingFile = state.docInfo?.files.find(
      (f) => f.path === params.path
    );
    const existingPRFile = state.docInfo?.existingPR?.files.find(
      (f) => f.path === params.path
    );

    const category = params.path.split("/").slice(-2, -1)[0];
    const similarDocs = await findSimilarDocs(
      octokit,
      params.path,
      category,
      params.context?.template_paths,
      state
    );

    if (params.type === "navigation") {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a documentation expert. Update the Mintlify navigation structure in mint.json.
Consider:
1. Keep existing structure where possible
2. Group related documentation together (e.g., all LLM providers under "LLM Providers")
3. Use clear, descriptive group names
4. Maintain a logical order (overview first, then details)
5. Keep similar items together (e.g., all HTTP clients together)

Return only the content for mint.json, properly formatted as JSON.`,
          },
          {
            role: "user",
            content: `Current navigation:
${existingFile?.content || "{}"}

Files to add/update:
${state.docInfo?.files
  .filter((f) => f.type === "doc")
  .map((f) => f.path)
  .join("\n")}

Context:
${params.context?.code_changes || ""}

Reason for update:
${params.context?.reason || "Documentation structure needs updating"}`,
          },
        ],
      });

      return {
        ...context,
        state: {
          ...state,
          generatedContent: {
            content: response.choices[0].message.content || "",
            path: params.path,
            type: params.type,
          },
        },
      };
    }

    // For regular documentation
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a documentation expert specializing in TypeScript libraries. Write clear, comprehensive documentation.

Your documentation MUST include:
1. A clear overview of what the code does and its purpose
2. Installation and setup instructions if relevant
3. Detailed API documentation for all exports (interfaces, functions, etc)
4. Multiple practical code examples showing common use cases
5. Configuration options and their effects
6. Error handling and troubleshooting
7. Best practices and important considerations

MDX Formatting Rules:
1. Use {/* */} for comments, not HTML <!-- --> style
2. Always add a blank line before and after code blocks
3. Ensure code blocks have proper language tags:
   \`\`\`typescript
   // code here
   \`\`\`
4. Use proper heading spacing: "## Heading" not "##Heading"
5. Keep consistent newline spacing - one blank line between sections
6. Use proper MDX components for callouts, tabs, etc.
7. Start with frontmatter (---) containing title and description

${
  state.config.llmConfig?.styleGuide
    ? `Custom Style Guide:\n${state.config.llmConfig.styleGuide}\n`
    : ""
}

${
  similarDocs.length > 0
    ? `
Style Guide (based on similar docs):
${similarDocs
  .map(
    (doc, i) => `
Example Doc ${i + 1}:
\`\`\`mdx
${doc}
\`\`\`
`
  )
  .join("\n")}

Follow the style, structure, and formatting of these similar documents while writing the new content.
`
    : ""
}

You MUST generate complete, detailed documentation. Do not use placeholder text or TODO comments.
Return ONLY the MDX content, starting with frontmatter (---).`,
        },
        {
          role: "user",
          content: `${
            existingFile?.content
              ? `Current content:\n${existingFile.content}\n\n`
              : ""
          }
${
  existingPRFile?.content
    ? `Content in existing PR:\n${existingPRFile.content}\n\n`
    : ""
}

Code changes to document:
\`\`\`typescript
${params.context?.code_changes || ""}
\`\`\`

Related files:
${params.context?.related_files?.join("\n") || ""}

Task: ${
            params.context?.update_type === "create"
              ? `Create new documentation for ${category} following the style of similar files.`
              : `Update existing documentation to reflect changes.`
          }

Reason: ${
            params.context?.reason ||
            "Documentation needs to be updated based on code changes"
          }

Generate complete, detailed documentation for this code, including all exports, configuration options, and usage examples.
Do not use placeholder text - the documentation should be production-ready.`,
        },
      ],
      temperature: state.config.llmConfig?.temperature || 0.3,
    });

    const content = response.choices[0].message.content || "";

    // Validate content isn't just placeholder text
    if (
      content.length < 100 || // Too short
      content.includes("TODO") ||
      content.includes("placeholder") ||
      !content.includes("```") // No code examples
    ) {
      throw new Error(
        "Generated content appears to be incomplete or placeholder text. Please try again with more detail."
      );
    }

    // Return the generated content - let the LLM handle committing it
    return {
      ...context,
      state: {
        ...state,
        generatedContent: {
          content,
          path: params.path,
          type: params.type,
          update_type: params.context?.update_type || "update",
        },
      },
    };
  },
});
