// Jarvis Git Manager — W1 frozen interfaces (MASTER_PROMPT.md §11).
// Consumers (W2 kernel / cleanup / layout) freeze this file after W1 audit.

export type Token =
  | "HOME-LEAK"
  | "PUFFER-PARENT"
  | "LIVE-WORKER"
  | "STALE-PREVIEW"
  | "WORKTREE-BOUND"
  | "ADD-A-FORBIDDEN"
  | "AMEND-FORBIDDEN"
  | "FORCE-MAIN"
  | "UNOWNED-PATH";

export type WorktreeClass = "product" | "wrapper" | "leftover" | "keep-live";

// status JSON: repoRoot commonDir branch head nestedGit[] leak worktrees[]
export interface StatusWorktree {
  path: string;
  branch: string;
  head: string;
}

export interface StatusJson {
  repoRoot: string;
  commonDir: string;
  branch: string;
  head: string;
  nestedGit: string[];
  leak: boolean;
  worktrees: StatusWorktree[];
}

// health JSON: worktrees[{path,repo,branch,head,class}]
export interface HealthWorktree {
  path: string;
  repo: string;
  branch: string;
  head: string;
  class: WorktreeClass;
}

export interface HealthJson {
  worktrees: HealthWorktree[];
}

// plan-clean JSON: previewId ops[] keep[] measuredAt
export interface PreviewOp {
  action: string;
  target: string;
  dest?: string;
  reason?: string;
}

export interface PlanCleanJson {
  previewId: string;
  ops: PreviewOp[];
  keep: string[];
  measuredAt: string;
}

// Refuse result value: failures are values; CLI exits 2 with named token.
export type RefuseResult = { ok: false; token: Token; message: string };

export class RefuseError extends Error {
  readonly token: Token;
  constructor(token: Token, message: string) {
    super(message);
    this.name = "RefuseError";
    this.token = token;
  }
  toResult(): RefuseResult {
    return { ok: false, token: this.token, message: this.message };
  }
}
