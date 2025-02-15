import { getCommitInfo } from "./getCommitInfo";
import { findDocumentation } from "./findDocumentation";
import { writeDocumentation } from "./writeDocumentation";
import { commitChange } from "./commitChange";
import { managePR } from "./managePR";
import { getBranch } from "./getBranch";

export const actions = [
  getCommitInfo,
  findDocumentation,
  getBranch,
  writeDocumentation,
  commitChange,
  managePR,
];

export * from "./getCommitInfo";
export * from "./findDocumentation";
export * from "./writeDocumentation";
export * from "./commitChange";
export * from "./managePR";
export * from "./getBranch";
