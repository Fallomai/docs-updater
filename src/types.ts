export interface ReviewFeedback {
  line: number;
  comment: string;
}

export interface ReviewResponse {
  feedback: ReviewFeedback[];
}

export interface FileReview {
  file: string;
  feedback: ReviewFeedback[];
}

export interface DocUpdate {
  file: string;
  content: string;
  reason: string;
}

export interface DocConfig {
  // Essential settings
  docsPath: string; // Path to docs (e.g., "docs" or "apps/docs")
  isMonorepo?: boolean; // Is this a monorepo setup?

  // Repository settings (optional, defaults to PR repository)
  docsRepoOwner?: string; // GitHub owner of docs repo if different
  docsRepoName?: string; // Name of docs repo if different
  docsBranch?: string; // Branch to update (defaults to 'main')

  // Documentation settings
  fileTypes?: string[]; // Doc file types (defaults to ['.mdx', '.md'])
  ignorePaths?: string[]; // Paths to ignore

  // PR settings
  createNewPr?: boolean; // Create new PR vs update original (defaults to true)
  labels?: string[]; // Labels to add to PR

  // Optional customization
  styleGuide?: string; // Custom documentation style guide
}

export interface DocUpdateConfig {
  docsPath: string;
  docsRepo?: {
    owner: string;
    repo: string;
    branch: string;
    monorepo: boolean;
  };
  matchRules: {
    docExtensions: string[];
    ignorePatterns: string[];
    pathMappings?: Record<string, string>;
  };
  prConfig: {
    updateOriginalPr: boolean;
    branchPrefix: string;
    titleTemplate: string;
    bodyTemplate: string;
    labels: string[];
  };
  llmConfig?: {
    styleGuide?: string;
    temperature?: number;
  };
}

export interface CodeChange {
  file: string;
  patch: string;
  type: "added" | "modified" | "deleted";
  significance: {
    hasExports: boolean;
    hasInterfaces: boolean;
    hasClasses: boolean;
    hasTypes: boolean;
    hasEnums: boolean;
    isTest: boolean;
  };
  category?: string;
  relatedFiles?: string[];
}

export interface CodeAnalysis {
  changes: CodeChange[];
  impactedAreas: string[];
  significantChanges: boolean;
  summary: string;
}

export interface DocFile {
  path: string;
  type: string;
  category?: string;
  lastModified?: string;
  references?: string[];
}

export interface DocStructure {
  files: DocFile[];
  categories: string[];
  navigation: NavigationItem[];
  fileTree: string;
}

export interface NavigationItem {
  group: string;
  pages: string[];
}

export interface PlannedDocUpdate {
  path: string;
  type: "create" | "update";
  reason: string;
  priority: "high" | "medium" | "low";
  sourceFiles: string[];
  relatedDocs?: string[];
  suggestedContent?: {
    title?: string;
    sections?: string[];
    examples?: string[];
  };
}

export interface UpdatePlan {
  summary: string;
  updates: PlannedDocUpdate[];
  navigationChanges?: {
    group: string;
    changes: Array<{
      type: "add" | "move" | "remove";
      page: string;
    }>;
  }[];
}

export interface GeneratedContent {
  files: Array<{
    path: string;
    content: string;
    type: "create" | "update";
    reason: string;
  }>;
  navigationUpdate?: {
    path: string;
    content: string;
    changes: Array<{
      type: "add" | "move" | "remove";
      page: string;
      group: string;
    }>;
  };
}

export interface CommitInfo {
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

export interface DocInfo {
  files: Array<{
    path: string;
    content: string | null;
    type: "doc" | "navigation";
    lastModified?: string;
  }>;
  existingPR?: {
    number: number;
    branch: string;
    files: Array<{
      path: string;
      content: string;
    }>;
  };
}

export interface ReviewState {
  owner: string;
  repo: string;
  pull_number: number;
  config: DocUpdateConfig;
  commitInfo?: CommitInfo;
  docInfo?: DocInfo;
  branchInfo?: {
    name: string;
    sha: string;
    exists: boolean;
  };
}
