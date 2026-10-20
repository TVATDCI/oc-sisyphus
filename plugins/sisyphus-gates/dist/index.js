/**
 * dist/index.js — dual-generation entry point (fm/oc-v2-adapt).
 *
 * V1 (pinned 1.18.31): the named `server` re-export below is the exact
 * byte-equivalent path the current install already loads (the V1 tuple
 * in opencode.json resolves this file via package.json "main"). The
 * default export additionally carries `server()` per the official
 * dual-support shape for V1 hosts that prefer the default export
 * (supported since 1.18.29) — both resolve to the same untouched
 * implementation in src/plugin.js.
 *
 * V2 (2.1.0+): reads the default export's `id` + `setup(ctx)`, ignoring
 * `server()`. The proven 2.1.0 loading route for local plugins is
 * auto-discovery of a plain file under plugins/ — see
 * ../../plugins/sisyphus-gates.js (repo plugins/ dir), which re-exports
 * this default. Config-object routes for local dirs are ignored by
 * 2.1.0 (scout matrix rows 2-5); re-verify single-load behavior if the
 * V2 pin is ever moved past the cutover-verified version.
 */

export { server } from "../src/plugin.js";
export { v2Definition as default } from "../src/v2.js";
