/**
 * tools/build-dist.js — the dist rebuild pipeline (dist-staleness class-killer).
 *
 * dist/index.js is the V1 plugin entry: a re-export shim over
 * ../src/plugin.js named `server`, deliberately WITHOUT a default export
 * (V1 1.18.31 double-instantiates a named+default module — see
 * test/v2-plugin.test.js). The shim resolves src live at load time, so its
 * *runtime* content is always current; what can go stale is the *committed
 * artifact* drifting from what the pipeline would generate (the twin-desk
 * 2026-06-07..2026-11 lesson: a deployed pre-shim bundle sat frozen for
 * five months).
 *
 * This tool makes the artifact regenerable and self-describing:
 *   - computes a deterministic sha256 stamp over the whole src/ tree,
 *   - writes dist/index.js = stamp header + the byte-exact pre-port
 *     re-export payload (md5 4fb46499ec2892e72943b63cf200b3f8, the bytes
 *     d95ae9c pinned),
 *   - is deterministic: sorted file walk, posix-normalized paths, no
 *     timestamps, no absolute paths — two runs on any machine produce
 *     identical bytes.
 *
 * test/dist-staleness.test.js recomputes the stamp from src/ and fails
 * the suite whenever the committed dist is stale relative to src.
 *
 * Usage:  npm run build   (or: node tools/build-dist.js)
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(PLUGIN_ROOT, "src");
const DIST_FILE = join(PLUGIN_ROOT, "dist", "index.js");

/** The V1 payload: the exact pre-port bytes d95ae9c md5-pinned (43 bytes incl. \n). */
export const REEXPORT_LINE = 'export { server } from "../src/plugin.js";\n';

/**
 * Deterministic stamp over the src/ tree: sha256 over
 * (posix-relative-path \0 file-bytes \0) for every file, walked in sorted
 * order. Includes the path so renames move the hash.
 */
export function computeSrcStamp() {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (readdirSyncStat(p)) walk(p);
      else files.push(p);
    }
  })(SRC_DIR);
  const h = createHash("sha256");
  for (const p of files) {
    h.update(relative(SRC_DIR, p).split(sep).join("/"));
    h.update("\0");
    h.update(readFileSync(p));
    h.update("\0");
  }
  return h.digest("hex");
}

// Small helper kept separate so the walk above stays readable; Node has no
// sync dirent-with-type guarantee across platforms without it.
import { statSync } from "node:fs";
function readdirSyncStat(p) {
  return statSync(p).isDirectory();
}

/** Full generated file bytes for a given src stamp. */
export function renderDist(stamp) {
  return `/**
 * dist/index.js — GENERATED FILE. Do not hand-edit.
 *
 * Rebuilt by \`npm run build\` (tools/build-dist.js) from the current src/
 * tree. The src-stamp below binds this committed artifact to the exact
 * src content it was generated from; test/dist-staleness.test.js
 * recomputes the hash from src/ and fails the suite when dist is stale
 * relative to src.
 *
 * src-stamp: sha256:${stamp}
 *
 * V1 contract (guarded by test/v2-plugin.test.js and re-asserted in
 * test/dist-staleness.test.js): named \`server\` only — NO default export
 * while V1 1.18.31 is pinned (double-instantiation hazard). The payload
 * re-export line below is byte-identical to the pre-port file
 * (md5 4fb46499ec2892e72943b63cf200b3f8). The V2 default export lives in
 * the repo-level plugins/sisyphus-gates.js auto-discovery shim.
 */

${REEXPORT_LINE}`;
}

function main() {
  const stamp = computeSrcStamp();
  const out = renderDist(stamp);
  writeFileSync(DIST_FILE, out);
  console.log(`dist/index.js rebuilt from src (src-stamp: sha256:${stamp})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
