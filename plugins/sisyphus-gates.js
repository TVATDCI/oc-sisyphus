/**
 * plugins/sisyphus-gates.js — V2 auto-discovery entry for sisyphus-gates.
 *
 * Empirically proven 2.1.0 loading route (scout matrix row 6): a plain
 * .js file under plugins/ with a plain-object default export is
 * auto-discovered and loaded. The 2.1.0 release ignores config-declared
 * local-dir plugin routes (matrix rows 2-5), so this file is how the
 * ported gate reaches V2.
 *
 * V1 (pinned 1.18.31) does not auto-discover this file — the V1 path
 * stays the opencode.json tuple -> sisyphus-gates/dist/index.js named
 * `server` export. Exactly one generation of the gate loads per host
 * (verified in the sandbox probes for both installs).
 *
 * Options note: auto-discovery delivers no ctx.options; src/v2.js
 * resolveOptions() falls back to reading the sisyphus-gates options
 * block from opencode.json(c) in this config tree.
 */

import definition from "./sisyphus-gates/dist/index.js";

export default definition;
