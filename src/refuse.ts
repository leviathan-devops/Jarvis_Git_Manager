// Bun-only: `process` is a Bun global (matches every module: git-manager.ts, status.ts, health.ts...). No import — Deno/browser out of scope.
import type { Token } from "./types.ts";

// Tokens: HOME-LEAK PUFFER-PARENT LIVE-WORKER STALE-PREVIEW WORKTREE-BOUND
// ADD-A-FORBIDDEN AMEND-FORBIDDEN FORCE-MAIN UNOWNED-PATH.
// Writes the token on stderr and exits 2. No git commands here, ever.
export function refuse(token: Token, message: string): never {
  process.stderr.write(`${token}: ${message}\n`);
  process.exit(2);
}
