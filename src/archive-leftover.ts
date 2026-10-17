// Jarvis Git Manager — archive leftover worktrees.
//
// The daemon tick classifies leftovers and stores them. It never moves them,
// so the leftover count stays flat. This action is the cleanup: it MOVES a
// clean, unlocked leftover into an archive directory and writes a manifest.
// It does not unlink files, does not `rm`, and does not `git worktree remove`
// or prune.
//
// Dry-run unless --apply. An interrupted move is journaled in the manifest
// (planned → moving → archived) and the next --apply finishes it.

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { classifyWorktree } from "./health.ts";
import { isKeepLive } from "./keep-table.ts";
import { normPath } from "./status.ts";
import type { WorktreeClass } from "./types.ts";

const ARCHIVE_LOCK_REASON = "jgm-archived";

type ArchiveState = "planned" | "moving" | "archived";

type Disposition =
  | "would-archive"
  | "skip-dirty"
  | "skip-active"
  | "skip-unsafe"
  | "skip-archived";

interface ListedWorktree {
  path: string;
  branch: string;
  head: string;
  locked: boolean;
  lockReason: string;
}

interface ArchivedFile {
  rel: string;
  sha256: string;
  bytes: number;
}

interface ArchiveManifest {
  version: 1;
  id: string;
  state: ArchiveState;
  repo: string;
  source: string;
  dest: string;
  branch: string;
  head: string;
  files: ArchivedFile[];
  moved: string[];
  startedAt: string;
  updatedAt: string;
}

export interface ArchiveCandidate {
  path: string;
  branch: string;
  head: string;
  worktreeClass: WorktreeClass;
  disposition: Disposition;
  reason: string;
}

export interface ArchivedTree {
  source: string;
  dest: string;
  manifest: string;
  branch: string;
  head: string;
}

export interface ArchiveReport {
  action: "archive-leftover";
  dry: boolean;
  apply: boolean;
  mutated: boolean;
  repo: string;
  archiveDir: string;
  planned: ArchiveCandidate[];
  archived: ArchivedTree[];
  resumed: ArchivedTree[];
  skipped: ArchiveCandidate[];
}

export interface ArchiveOptions {
  repo: string;
  archiveDir: string;
  apply: boolean;
  now?: Date;
  /** Test seam: throw after this many renames so a partial journal can be resumed. */
  faultAfterMoves?: number;
  /** Test seam: force the pre-fix no-op (detect leftovers, archive nothing). */
  plantedBug?: boolean;
}

export class ArchiveInterrupted extends Error {
  readonly manifestPath: string;
  constructor(message: string, manifestPath: string) {
    super(message);
    this.name = "ArchiveInterrupted";
    this.manifestPath = manifestPath;
  }
}

class UnsafeWorktree extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeWorktree";
  }
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[]): GitResult {
  const r = spawnSync(
    "git",
    ["-c", "core.fsmonitor=false", "-c", "commit.gpgsign=false", "-C", cwd, ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  );
  return {
    code: r.status ?? 1,
    stdout: typeof r.stdout === "string" ? r.stdout : "",
    stderr: typeof r.stderr === "string" ? r.stderr : "",
  };
}

function gitOk(cwd: string, args: string[]): string {
  const r = git(cwd, args);
  if (r.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr.trim()}`);
  }
  return r.stdout;
}

function iso(d: Date): string {
  return d.toISOString();
}

function inside(parent: string, child: string): boolean {
  const p = normPath(parent);
  const c = normPath(child);
  return c === p || c.startsWith(p + sep);
}

function slug(branch: string): string {
  const s = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (s.length > 0 ? s : "detached").slice(0, 48);
}

function knownState(state: ArchiveState): void {
  switch (state) {
    case "planned":
    case "moving":
    case "archived":
      return;
    default: {
      const unknown: never = state;
      throw new Error(`unknown archive state ${String(unknown)}`);
    }
  }
}

function isSkip(disposition: Disposition): boolean {
  switch (disposition) {
    case "would-archive":
      return false;
    case "skip-dirty":
    case "skip-active":
    case "skip-unsafe":
    case "skip-archived":
      return true;
    default: {
      const unknown: never = disposition;
      throw new Error(`unknown disposition ${String(unknown)}`);
    }
  }
}

function parsePorcelain(out: string): ListedWorktree[] {
  const rows: ListedWorktree[] = [];
  for (const block of out.split("\n\n")) {
    let path = "";
    let branch = "";
    let head = "";
    let locked = false;
    let lockReason = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) path = normPath(line.slice("worktree ".length).trim());
      else if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length).trim();
      else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      } else if (line.trim() === "detached") branch = "detached";
      else if (line === "locked" || line.startsWith("locked ")) {
        locked = true;
        lockReason = line === "locked" ? "" : line.slice("locked ".length).trim();
      }
    }
    if (path) rows.push({ path, branch, head, locked, lockReason });
  }
  return rows;
}

function mainWorktree(repo: string): string {
  const common = normPath(gitOk(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
  const suffix = `${sep}.git`;
  if (!common.endsWith(suffix)) {
    throw new Error(`refusing bare repository at ${common}`);
  }
  return normPath(common.slice(0, -suffix.length));
}

function gitDirOf(worktree: string): string | null {
  const r = git(worktree, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  if (r.code !== 0) return null;
  const raw = r.stdout.trim();
  if (!raw) return null;
  return normPath(isAbsolute(raw) ? raw : resolve(worktree, raw));
}

function linkedWorktree(worktree: string, main: string): boolean {
  return normPath(worktree) !== normPath(main);
}

function dirty(worktree: string): boolean {
  const r = git(worktree, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (r.code !== 0) return true;
  return r.stdout.length > 0;
}

function indexLocked(worktree: string): boolean {
  const gitDir = gitDirOf(worktree);
  if (gitDir === null) return true;
  return existsSync(join(gitDir, "index.lock"));
}

function ourArchiveLock(row: ListedWorktree): boolean {
  return row.locked && row.lockReason === ARCHIVE_LOCK_REASON;
}

function decide(
  row: ListedWorktree,
  main: string,
  archiveDir: string,
  toplevels: Set<string>,
): ArchiveCandidate {
  const base = {
    path: row.path,
    branch: row.branch,
    head: row.head,
  };
  if (inside(archiveDir, row.path) || ourArchiveLock(row)) {
    return {
      ...base,
      worktreeClass: classifyWorktree(row.path, toplevels),
      disposition: "skip-archived",
      reason: "already archived (archive dir or jgm-archived lock)",
    };
  }
  if (
    !linkedWorktree(row.path, main) ||
    isKeepLive(row.path) ||
    row.locked ||
    indexLocked(row.path)
  ) {
    return {
      ...base,
      worktreeClass: classifyWorktree(row.path, toplevels),
      disposition: "skip-active",
      reason: "main, keep-live, locked, or busy worktree",
    };
  }
  const worktreeClass = classifyWorktree(row.path, toplevels);
  if (worktreeClass !== "leftover") {
    return {
      ...base,
      worktreeClass,
      disposition: "skip-active",
      reason: `class ${worktreeClass} is not leftover`,
    };
  }
  if (dirty(row.path)) {
    return {
      ...base,
      worktreeClass,
      disposition: "skip-dirty",
      reason: "uncommitted or untracked changes",
    };
  }
  if (inside(row.path, archiveDir)) {
    return {
      ...base,
      worktreeClass,
      disposition: "skip-unsafe",
      reason: "archive dir is inside the worktree",
    };
  }
  return {
    ...base,
    worktreeClass,
    disposition: "would-archive",
    reason: "clean unlocked leftover",
  };
}

function safeRel(root: string, rel: string): string {
  if (rel.length === 0 || isAbsolute(rel) || rel.split("/").includes("..")) {
    throw new UnsafeWorktree(`unsafe relative path ${rel}`);
  }
  const abs = resolve(root, ...rel.split("/"));
  const back = relative(root, abs);
  if (back.startsWith("..") || isAbsolute(back)) {
    throw new UnsafeWorktree(`path escapes worktree: ${rel}`);
  }
  return abs;
}

function walkFiles(root: string): ArchivedFile[] {
  const files: ArchivedFile[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(root, abs).split(sep).join("/");
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) {
        throw new UnsafeWorktree(`refusing to archive symlink ${rel}`);
      }
      if (st.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!st.isFile()) {
        throw new UnsafeWorktree(`refusing to archive non-regular file ${rel}`);
      }
      safeRel(root, rel);
      const buf = readFileSync(abs);
      files.push({
        rel,
        sha256: createHash("sha256").update(buf).digest("hex"),
        bytes: buf.length,
      });
    }
  }
  files.sort((a, b) => {
    if (a.rel === ".git") return 1;
    if (b.rel === ".git") return -1;
    if (a.rel < b.rel) return -1;
    if (a.rel > b.rel) return 1;
    return 0;
  });
  return files;
}

function manifestPath(archiveDir: string, id: string): string {
  return join(archiveDir, id, "manifest.json");
}

function flushManifest(archiveDir: string, doc: ArchiveManifest): void {
  knownState(doc.state);
  const dir = join(archiveDir, doc.id);
  mkdirSync(dir, { recursive: true });
  const finalPath = join(dir, "manifest.json");
  const tmpPath = join(dir, "manifest.json.tmp");
  const fd = openSync(tmpPath, "w");
  try {
    writeFileSync(fd, JSON.stringify(doc, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, finalPath);
}

function readManifest(path: string): ArchiveManifest {
  const doc = JSON.parse(readFileSync(path, "utf8")) as ArchiveManifest;
  if (doc.version !== 1) throw new Error(`unsupported manifest version at ${path}`);
  knownState(doc.state);
  if (!Array.isArray(doc.files) || !Array.isArray(doc.moved)) {
    throw new Error(`manifest ${path} is missing file lists`);
  }
  return doc;
}

function openManifests(archiveDir: string, repo: string): ArchiveManifest[] {
  if (!existsSync(archiveDir)) return [];
  const out: ArchiveManifest[] = [];
  for (const name of readdirSync(archiveDir)) {
    const path = join(archiveDir, name, "manifest.json");
    if (!existsSync(path)) continue;
    const doc = readManifest(path);
    if (normPath(doc.repo) !== normPath(repo)) continue;
    if (doc.state === "planned" || doc.state === "moving") out.push(doc);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

function removeEmptyDirs(root: string, archiveDir: string): void {
  if (inside(archiveDir, root) || inside(root, archiveDir)) {
    throw new Error(`refusing to clean ${root}: it overlaps the archive dir`);
  }
  if (!existsSync(root)) return;
  const st = lstatSync(root);
  if (!st.isDirectory()) return;
  for (const name of readdirSync(root)) {
    const child = join(root, name);
    if (lstatSync(child).isDirectory()) removeEmptyDirs(child, archiveDir);
  }
  if (readdirSync(root).length === 0) rmdirSync(root);
}

function verifyTree(doc: ArchiveManifest): void {
  for (const file of doc.files) {
    const abs = safeRel(doc.dest, file.rel);
    if (!existsSync(abs)) throw new Error(`archived file missing: ${file.rel}`);
    const buf = readFileSync(abs);
    const hash = createHash("sha256").update(buf).digest("hex");
    if (hash !== file.sha256 || buf.length !== file.bytes) {
      throw new Error(`archived file hash mismatch: ${file.rel}`);
    }
    const src = safeRel(doc.source, file.rel);
    if (existsSync(src)) {
      throw new Error(`refusing to delete ${file.rel}: still present at source after move`);
    }
  }
}

function repairAndTag(doc: ArchiveManifest): void {
  const repaired = git(doc.dest, ["worktree", "repair"]);
  if (repaired.code !== 0) {
    throw new Error(`git worktree repair failed: ${repaired.stderr.trim()}`);
  }
  const locked = git(doc.repo, ["worktree", "lock", "--reason", ARCHIVE_LOCK_REASON, doc.dest]);
  if (locked.code !== 0) {
    const listed = parsePorcelain(gitOk(doc.repo, ["worktree", "list", "--porcelain"]));
    const row = listed.find((w) => w.path === normPath(doc.dest));
    if (row === undefined || !ourArchiveLock(row)) {
      throw new Error(`git worktree lock failed: ${locked.stderr.trim()}`);
    }
  }
}

function executeManifest(archiveDir: string, doc: ArchiveManifest, opts: ArchiveOptions, now: Date): void {
  knownState(doc.state);
  if (doc.state === "archived") return;
  if (!inside(archiveDir, doc.dest)) {
    throw new Error(`manifest dest escapes archive dir: ${doc.dest}`);
  }
  doc.state = "moving";
  doc.updatedAt = iso(now);
  flushManifest(archiveDir, doc);
  const journal = manifestPath(archiveDir, doc.id);
  let performed = 0;
  for (const file of doc.files) {
    if (doc.moved.includes(file.rel)) continue;
    const src = safeRel(doc.source, file.rel);
    const dest = safeRel(doc.dest, file.rel);
    const srcOk = existsSync(src);
    const destOk = existsSync(dest);
    if (!srcOk && destOk) {
      doc.moved.push(file.rel);
      doc.updatedAt = iso(new Date());
      flushManifest(archiveDir, doc);
      continue;
    }
    if (!srcOk && !destOk) {
      throw new Error(`archive lost ${file.rel}: absent from source and dest`);
    }
    if (srcOk && destOk) {
      throw new Error(`refusing to delete ${file.rel}: present at both source and dest`);
    }
    if (opts.faultAfterMoves !== undefined && performed >= opts.faultAfterMoves) {
      throw new ArchiveInterrupted(
        `stopped after ${performed} move(s); resume with --apply`,
        journal,
      );
    }
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(src, dest);
    performed += 1;
    doc.moved.push(file.rel);
    doc.updatedAt = iso(new Date());
    flushManifest(archiveDir, doc);
  }
  if (doc.moved.length !== doc.files.length) {
    throw new Error(`archive incomplete for ${doc.source}: ${doc.moved.length}/${doc.files.length}`);
  }
  removeEmptyDirs(doc.source, archiveDir);
  verifyTree(doc);
  repairAndTag(doc);
  verifyTree(doc);
  doc.state = "archived";
  doc.updatedAt = iso(new Date());
  flushManifest(archiveDir, doc);
}

function toArchived(doc: ArchiveManifest, archiveDir: string): ArchivedTree {
  return {
    source: doc.source,
    dest: doc.dest,
    manifest: manifestPath(archiveDir, doc.id),
    branch: doc.branch,
    head: doc.head,
  };
}

function emptyReport(repo: string, archiveDir: string, apply: boolean): ArchiveReport {
  return {
    action: "archive-leftover",
    dry: !apply,
    apply,
    mutated: false,
    repo,
    archiveDir,
    planned: [],
    archived: [],
    resumed: [],
    skipped: [],
  };
}

function detect(repo: string, archiveDir: string): ArchiveCandidate[] {
  const main = mainWorktree(repo);
  const toplevels = new Set<string>([main]);
  const listed = parsePorcelain(gitOk(main, ["worktree", "list", "--porcelain"]));
  return listed.map((row) => decide(row, main, archiveDir, toplevels));
}

function beginManifest(
  archiveDir: string,
  repo: string,
  candidate: ArchiveCandidate,
  now: Date,
): ArchiveManifest {
  const files = walkFiles(candidate.path);
  const id = `${slug(candidate.branch)}-${candidate.head.slice(0, 7)}-${now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")}-${randomBytes(3).toString("hex")}`;
  const doc: ArchiveManifest = {
    version: 1,
    id,
    state: "planned",
    repo,
    source: candidate.path,
    dest: normPath(join(archiveDir, id, "tree")),
    branch: candidate.branch,
    head: candidate.head,
    files,
    moved: [],
    startedAt: iso(now),
    updatedAt: iso(now),
  };
  flushManifest(archiveDir, doc);
  return doc;
}

export async function archiveLeftovers(opts: ArchiveOptions): Promise<ArchiveReport> {
  // Pre-fix behavior, used by CI to show the archive test failing before the real run.
  // Classification still happens; no directory is created and no file is renamed.
  const planted =
    opts.plantedBug === true || process.env.JGM_ARCHIVE_PLANTED_BUG === "1";
  const apply = planted ? false : opts.apply;
  const repo = mainWorktree(opts.repo);
  const archiveDir = normPath(resolve(opts.archiveDir));
  const report = emptyReport(repo, archiveDir, apply);
  const now = opts.now ?? new Date();

  if (apply) {
    for (const doc of openManifests(archiveDir, repo)) {
      executeManifest(archiveDir, doc, { ...opts, faultAfterMoves: undefined }, now);
      report.resumed.push(toArchived(doc, archiveDir));
      report.mutated = true;
    }
  }

  const openSources = new Set(openManifests(archiveDir, repo).map((doc) => normPath(doc.source)));
  for (const candidate of detect(repo, archiveDir)) {
    if (openSources.has(candidate.path)) continue;
    if (isSkip(candidate.disposition)) {
      report.skipped.push(candidate);
      continue;
    }
    if (!apply) {
      report.planned.push(candidate);
      continue;
    }
    let doc: ArchiveManifest;
    try {
      doc = beginManifest(archiveDir, repo, candidate, now);
    } catch (e) {
      if (e instanceof UnsafeWorktree) {
        report.skipped.push({
          ...candidate,
          disposition: "skip-unsafe",
          reason: e.message,
        });
        continue;
      }
      throw e;
    }
    report.planned.push(candidate);
    executeManifest(archiveDir, doc, opts, now);
    report.archived.push(toArchived(doc, archiveDir));
    report.mutated = true;
  }
  return report;
}

const DELETE_VERBS = ["delete", "remove", "prune", "drop", "destroy", "rm"];

function flagValue(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === name) return args[i + 1];
    if (a !== undefined && a.startsWith(name + "=")) return a.slice(name.length + 1);
  }
  return undefined;
}

export async function run(args: string[]): Promise<void> {
  const banned = args.find((a) => DELETE_VERBS.includes(a));
  if (banned !== undefined) {
    process.stderr.write(
      `archive-leftover: ${banned} is not allowed; this action only archives\n`,
    );
    process.exit(2);
  }
  const repo = flagValue(args, "--repo");
  const archiveDir = flagValue(args, "--archive-dir");
  if (repo === undefined || repo.startsWith("--") || archiveDir === undefined || archiveDir.startsWith("--")) {
    process.stderr.write(
      "archive-leftover: --repo <path> --archive-dir <path> [--apply]\n" +
        "dry-run unless --apply. Never deletes.\n",
    );
    process.exit(1);
  }
  try {
    const report = await archiveLeftovers({
      repo,
      archiveDir,
      apply: args.includes("--apply"),
    });
    process.stdout.write(JSON.stringify(report) + "\n");
    if (report.dry) {
      process.stderr.write(
        `archive-leftover (dry): would archive ${report.planned.length} leftover(s); pass --apply to move them\n`,
      );
    }
  } catch (e) {
    if (e instanceof ArchiveInterrupted) {
      process.stderr.write(`archive-leftover: ${e.message}\n`);
      process.exit(1);
    }
    process.stderr.write(
      `archive-leftover: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
