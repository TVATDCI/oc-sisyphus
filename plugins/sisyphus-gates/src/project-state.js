/**
 * project-state.js — multi-project state isolation.
 *
 * W1.C adds per-project state at ~/.sisyphus/projects/{name}/state.json.
 * The plugin's state.js calls getActiveStatePath() to determine which
 * file to read/write. If a per-project state file exists, it takes
 * precedence over the global canonical state.
 *
 * Project name resolution priority (in getProjectName):
 *   1. cwd/boulder.json field `project_name`
 *   2. cwd/package.json field `name`
 *   3. basename of cwd
 *   4. If basename is "home" or empty → "default"
 *
 * Layout:
 *   ~/.sisyphus/state.json                      (global fallback)
 *   ~/.sisyphus/projects/{name}/state.json      (per-project)
 */

import { existsSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import {
  getCanonicalStatePath,
  getProjectStatePath as getProjectStatePathFromPaths,
  getProjectStateDir as getProjectStateDirFromPaths,
} from "./paths.js";

/**
 * Look up the project name for a given working directory.
 * Priority: boulder.json.project_name → package.json.name → basename → "default".
 *
 * Examples:
 *   getProjectName("/path/to/repo-with-boulder")     → "foo" (from boulder.json)
 *   getProjectName("/path/to/repo-with-package")     → "bar" (from package.json)
 *   getProjectName("/path/to/just-a-dir")            → "just-a-dir" (basename)
 *   getProjectName("/")                              → "default" (empty basename)
 *   getProjectName("/home/user")                    → "user" (basename of HOME)
 *   getProjectName("/tmp/home")                      → "default" (basename == "home")
 */
export function getProjectName(cwd) {
  const dir = cwd || process.cwd();

  // 1. boulder.json project_name
  const boulderPath = join(dir, "boulder.json");
  if (existsSync(boulderPath)) {
    try {
      const content = readFileSync(boulderPath, "utf-8");
      const parsed = JSON.parse(content);
      if (
        parsed &&
        typeof parsed.project_name === "string" &&
        parsed.project_name.length > 0
      ) {
        return parsed.project_name;
      }
    } catch {
      // fall through
    }
  }

  // 2. package.json name
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const content = readFileSync(pkgPath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.name === "string" && parsed.name.length > 0) {
        return parsed.name;
      }
    } catch {
      // fall through
    }
  }

  // 3. basename
  const base = basename(dir);

  // 4. "default" for empty or "home"
  if (base === "" || base === "home" || base === "/") {
    return "default";
  }
  return base;
}

/**
 * Per-project state file path: ~/.sisyphus/projects/{name}/state.json
 */
export function getProjectStatePath(projectName) {
  return getProjectStatePathFromPaths(projectName);
}

/**
 * Per-project state directory: ~/.sisyphus/projects/{name}/
 */
export function getProjectStateDir(projectName) {
  return getProjectStateDirFromPaths(projectName);
}

/**
 * mkdir -p the per-project state directory. No-op if it already exists.
 */
export function ensureProjectDir(projectName) {
  const dir = getProjectStateDir(projectName);
  mkdirSync(dir, { recursive: true });
}

/**
 * Returns the state path to read/write for a given project.
 *   - If the per-project state file exists, return that path.
 *   - Otherwise, return the global canonical path.
 *
 * The plugin's state.js should call this with the current project name
 * (resolved via getProjectName(process.cwd())) on every read/write.
 */
export function getActiveStatePath(projectName) {
  if (projectName) {
    const projectPath = getProjectStatePath(projectName);
    if (existsSync(projectPath)) {
      return projectPath;
    }
  }
  return getCanonicalStatePath();
}

/**
 * List all project names with a state directory.
 * Excludes hidden directories.
 * Returns an empty array if ~/.sisyphus/projects/ does not exist.
 */
export function listProjects() {
  const home = process.env.HOME || "~";
  const projectsRoot = resolve(home, ".sisyphus", "projects");
  if (!existsSync(projectsRoot)) {
    return [];
  }
  const entries = readdirSync(projectsRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}
