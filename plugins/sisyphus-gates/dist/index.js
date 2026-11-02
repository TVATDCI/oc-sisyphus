/**
 * dist/index.js — GENERATED FILE. Do not hand-edit.
 *
 * Rebuilt by `npm run build` (tools/build-dist.js) from the current src/
 * tree. The src-stamp below binds this committed artifact to the exact
 * src content it was generated from; test/dist-staleness.test.js
 * recomputes the hash from src/ and fails the suite when dist is stale
 * relative to src.
 *
 * src-stamp: sha256:b1600acb3b9780c3eabc5c34dcda49717fe30a8fb1ae4c213e3f9a8fc711261f
 *
 * V1 contract (guarded by test/v2-plugin.test.js and re-asserted in
 * test/dist-staleness.test.js): named `server` only — NO default export
 * while V1 1.18.31 is pinned (double-instantiation hazard). The payload
 * re-export line below is byte-identical to the pre-port file
 * (md5 4fb46499ec2892e72943b63cf200b3f8). The V2 default export lives in
 * the repo-level plugins/sisyphus-gates.js auto-discovery shim.
 */

export { server } from "../src/plugin.js";
