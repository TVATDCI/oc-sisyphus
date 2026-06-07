/**
 * test/project-state.test.js — W1.C project-state tests.
 *
 * Tests for src/project-state.js and the new path helpers in src/paths.js.
 * Covers:
 *   - getProjectName from boulder.json → package.json → basename → "default"
 *   - getProjectStatePath / getProjectStateDir
 *   - ensureProjectDir creates the directory
 *   - getActiveStatePath: project path if exists, else global canonical
 *   - listProjects reads ~/.sisyphus/projects/
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 *
 * Run: `npm test` or `node --test test/project-state.test.js`
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";

import {
  getProjectName,
  getProjectStatePath,
  ensureProjectDir,
  getActiveStatePath,
  listProjects,
} from "../src/project-state.js";
import {
  getProjectStateDir,
  getProjectStatePath as getProjectStatePathFromPaths,
} from "../src/paths.js";

/**
 * Create a temp project directory and set process.env.HOME to its parent
 * (so the plugin's ~/.sisyphus/projects/ resolves to a sandbox).
 */
function withTempProjectHome(fn) {
  const originalHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "sisyphus-proj-test-"));
  mkdirSync(join(home, ".sisyphus", "projects"), { recursive: true });
  process.env.HOME = home;
  try {
    return fn(home);
  } finally {
    process.env.HOME = originalHome;
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

// ─── getProjectName: lookup priority ────────────────────────────────────────

describe("W1.C — getProjectName: lookup priority", () => {
  test("cwd with boulder.json {project_name: 'foo'} → returns 'foo'", () => {
    withTempProjectHome(() => {
      const cwd = mkdtempSync(join(tmpdir(), "proj-cwd-"));
      writeFileSync(
        join(cwd, "boulder.json"),
        JSON.stringify({ project_name: "foo" })
      );
      try {
        assert.equal(getProjectName(cwd), "foo");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  test("cwd with only package.json {name: 'bar'} → returns 'bar'", () => {
    withTempProjectHome(() => {
      const cwd = mkdtempSync(join(tmpdir(), "proj-cwd-"));
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ name: "bar" })
      );
      try {
        assert.equal(getProjectName(cwd), "bar");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  test("cwd with neither → returns basename of cwd", () => {
    withTempProjectHome(() => {
      const cwd = mkdtempSync(join(tmpdir(), "my-cool-project-"));
      try {
        const expected = basename(cwd);
        assert.equal(getProjectName(cwd), expected);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  test("cwd with both boulder.json and package.json → boulder.json wins", () => {
    withTempProjectHome(() => {
      const cwd = mkdtempSync(join(tmpdir(), "proj-cwd-"));
      writeFileSync(
        join(cwd, "boulder.json"),
        JSON.stringify({ project_name: "from-boulder" })
      );
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ name: "from-package" })
      );
      try {
        assert.equal(getProjectName(cwd), "from-boulder");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  test("boulder.json without project_name field → falls through to package.json", () => {
    withTempProjectHome(() => {
      const cwd = mkdtempSync(join(tmpdir(), "proj-cwd-"));
      writeFileSync(
        join(cwd, "boulder.json"),
        JSON.stringify({ other: "field" })
      );
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ name: "from-package" })
      );
      try {
        assert.equal(getProjectName(cwd), "from-package");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  test("cwd = '/' → returns 'default' (basename is empty)", () => {
    withTempProjectHome(() => {
      // process.cwd() will be the test dir, not '/', so we test the
      // fallback path by providing an empty basename
      // Simulate '/' by writing to a path that has empty basename
      assert.equal(getProjectName("/"), "default");
    });
  });

  test("basename 'home' (HOME dir) → returns 'default'", () => {
    withTempProjectHome((home) => {
      // The home dir is real; we want to test that basename "home" → "default"
      // But home's basename is the random temp name. We can simulate by
      // pointing at a path whose basename is literally "home".
      const fakeHome = join(tmpdir(), "home");
      mkdirSync(fakeHome, { recursive: true });
      try {
        assert.equal(getProjectName(fakeHome), "default");
      } finally {
        rmSync(fakeHome, { recursive: true, force: true });
      }
    });
  });
});

// ─── getProjectStatePath / getProjectStateDir ──────────────────────────────

describe("W1.C — getProjectStatePath: per-project state location", () => {
  test("getProjectStatePath('foo') returns ~/.sisyphus/projects/foo/state.json", () => {
    withTempProjectHome((home) => {
      const expected = resolve(home, ".sisyphus", "projects", "foo", "state.json");
      assert.equal(getProjectStatePath("foo"), expected);
    });
  });

  test("getProjectStateDir('foo') returns ~/.sisyphus/projects/foo/", () => {
    withTempProjectHome((home) => {
      const expected = resolve(home, ".sisyphus", "projects", "foo");
      assert.equal(getProjectStateDir("foo"), expected);
    });
  });

  test("getProjectStatePath from paths.js agrees with project-state.js", () => {
    withTempProjectHome(() => {
      assert.equal(
        getProjectStatePath("foo"),
        getProjectStatePathFromPaths("foo")
      );
    });
  });
});

// ─── ensureProjectDir ──────────────────────────────────────────────────────

describe("W1.C — ensureProjectDir: creates the project directory", () => {
  test("creates ~/.sisyphus/projects/{name}/ if missing", () => {
    withTempProjectHome((home) => {
      const projectDir = resolve(home, ".sisyphus", "projects", "newproj");
      assert.equal(existsSync(projectDir), false, "dir should not exist yet");
      ensureProjectDir("newproj");
      assert.equal(existsSync(projectDir), true, "dir should exist after call");
    });
  });

  test("does not throw if directory already exists", () => {
    withTempProjectHome(() => {
      ensureProjectDir("existing");
      // Second call should not throw
      ensureProjectDir("existing");
      assert.equal(
        existsSync(resolve(process.env.HOME, ".sisyphus", "projects", "existing")),
        true
      );
    });
  });
});

// ─── getActiveStatePath ─────────────────────────────────────────────────────

describe("W1.C — getActiveStatePath: project state or global canonical", () => {
  test("returns project state path if project file exists", () => {
    withTempProjectHome((home) => {
      const projectStatePath = resolve(
        home,
        ".sisyphus",
        "projects",
        "myproj",
        "state.json"
      );
      mkdirSync(resolve(home, ".sisyphus", "projects", "myproj"), {
        recursive: true,
      });
      writeFileSync(projectStatePath, "{}");

      assert.equal(getActiveStatePath("myproj"), projectStatePath);
    });
  });

  test("returns global canonical path if project file does NOT exist", () => {
    withTempProjectHome((home) => {
      // No project file, but ensure the .sisyphus/ root exists
      const globalPath = resolve(home, ".sisyphus", "state.json");
      assert.equal(getActiveStatePath("nonexistent"), globalPath);
    });
  });

  test("returns project state path when both exist (project wins)", () => {
    withTempProjectHome((home) => {
      // Both files exist
      const projectStatePath = resolve(
        home,
        ".sisyphus",
        "projects",
        "winproj",
        "state.json"
      );
      const globalPath = resolve(home, ".sisyphus", "state.json");
      mkdirSync(resolve(home, ".sisyphus", "projects", "winproj"), {
        recursive: true,
      });
      writeFileSync(projectStatePath, '{"project": true}');
      writeFileSync(globalPath, '{"project": false}');

      assert.equal(getActiveStatePath("winproj"), projectStatePath);
    });
  });
});

// ─── listProjects ──────────────────────────────────────────────────────────

describe("W1.C — listProjects: enumerate project names", () => {
  test("returns ['foo', 'bar'] when those dirs exist", () => {
    withTempProjectHome((home) => {
      const projectsRoot = resolve(home, ".sisyphus", "projects");
      mkdirSync(join(projectsRoot, "foo"), { recursive: true });
      mkdirSync(join(projectsRoot, "bar"), { recursive: true });

      const result = listProjects();
      assert.ok(result.includes("foo"), `expected 'foo' in ${JSON.stringify(result)}`);
      assert.ok(result.includes("bar"), `expected 'bar' in ${JSON.stringify(result)}`);
    });
  });

  test("excludes hidden directories", () => {
    withTempProjectHome((home) => {
      const projectsRoot = resolve(home, ".sisyphus", "projects");
      mkdirSync(join(projectsRoot, "visible"), { recursive: true });
      mkdirSync(join(projectsRoot, ".hidden"), { recursive: true });

      const result = listProjects();
      assert.ok(result.includes("visible"));
      assert.ok(!result.includes(".hidden"), `should not include .hidden: ${JSON.stringify(result)}`);
    });
  });

  test("returns empty array if projects/ does not exist", () => {
    withTempProjectHome(() => {
      // projects/ was created at withTempProjectHome setup, but we want to
      // test the "missing" case by pointing HOME at a fresh dir.
      const originalHome = process.env.HOME;
      const home = mkdtempSync(join(tmpdir(), "no-projects-"));
      process.env.HOME = home;
      try {
        // .sisyphus/ doesn't even exist
        const result = listProjects();
        assert.deepEqual(result, []);
      } finally {
        process.env.HOME = originalHome;
        rmSync(home, { recursive: true, force: true });
      }
    });
  });
});
