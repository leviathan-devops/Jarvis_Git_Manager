// Jarvis Git Manager — keep-live table (MASTER_PROMPT.md §2).
// Re-measured every health. LIVE WINS: operator moves update this table,
// never invent paths. Dual omp-worker-1: only the nested PLUTUS agent path
// below is keep-live; the outer ~/.omp/wt/plutus-main-66dfa4c dir is wrapper.

export const HOME = "/home/leviathan";
export const SHELL = "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace";

export const KEEP_PATHS: string[] = [
  "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent",
  "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent/.worktrees/grok-prototype",
  "/home/leviathan/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent",
  "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/Graph_Intelligence",
  "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/Graph_Intelligence-wt-gi-ship",
];

export function isKeepLive(absPath: string): boolean {
  if (!absPath.startsWith("/")) return false;
  const norm = absPath.length > 1 ? absPath.replace(/\/+$/, "") || "/" : absPath;
  for (const keep of KEEP_PATHS) {
    if (norm === keep || norm.startsWith(keep + "/")) return true;
  }
  return false;
}
