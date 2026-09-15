-- Jarvis Git Manager — SQLite store (MASTER_PROMPT.md §12).
-- Path: ~/.omp/git-manager/store.sqlite
-- Open with WAL + busy_timeout=5000 (kernel open helper lands in W2).
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS git_worktree (
  path TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  class TEXT NOT NULL,
  keep INTEGER NOT NULL DEFAULT 0,
  head TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS git_preview (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS git_op (
  preview_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_git_op_preview ON git_op(preview_id);
