/**
 * Drift-check CLI (sis) — the OPEN-2 session-begin slot consumer.
 *
 * Read-only bounded read (INV-2): opens EXACTLY two files — the DESK-SUFFIXED
 * state manifest (state/manifest.<ddd|tnt>.json, hostname-resolved like the
 * omo variant — desk-suffixed-manifests ruling 2026-10-28; the legacy shared
 * state/manifest.json is read ONLY as a one-time migration seed while the
 * suffixed file is absent) and the RESOLVED per-desk REPO omo variant
 * (omo-retire 2026-10-22: hostname-resolved at the config root,
 * OMO_JSONC_PATH env override; the model-binding source of truth — never
 * the retired ~/.omo/omo.jsonc) — and nothing else. Never writes (run under
 * `deno run --allow-read` — the grant proves it; scope the grant to exactly
 * the two paths for a mechanical bounded-read proof). Output contract
 * (shared spec §4): stale or missing → the single reminder flag on stdout,
 * exit 0; fresh → silence, exit 0; unreadable manifest → explicit error on
 * stderr, exit 1, no rebuild; unresolvable/absent binding source → explicit
 * error on stderr, exit 1 (fail-closed, no silent skip).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { checkDrift } from "./lib/drift.ts";
import { extractModelState, resolveOmoSource } from "./lib/model-state.ts";
import { readManifestText, resolveManifestPaths } from "./lib/manifest-path.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SKILL_DIR = join(SCRIPT_DIR, "..");
// Desk-suffixed manifest (2026-10-28): hostname-resolved like the omo
// variant; the legacy shared manifest.json is a migration-seed read only.
const MANIFEST_PATHS = resolveManifestPaths(join(SKILL_DIR, "state"));
const DEFAULT_MANIFEST = MANIFEST_PATHS.activePath;
// The binding source resolves at the config root (two ups from the skill dir
// = the repo/config root holding omo.<desk>.jsonc).
const DEFAULT_OMO = resolveOmoSource(join(SKILL_DIR, "..", "..")).absPath;
const OMO_REL = resolveOmoSource(join(SKILL_DIR, "..", "..")).relPath;

function main(): void {
  const argv = process.argv.slice(2);
  let manifestPath = DEFAULT_MANIFEST;
  let omoPath = DEFAULT_OMO;
  let json = false;
  for (const arg of argv) {
    if (arg.startsWith("--manifest=")) manifestPath = arg.slice("--manifest=".length);
    else if (arg.startsWith("--omo=")) omoPath = arg.slice("--omo=".length);
    else if (arg === "--json") json = true;
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  // Distinguish missing (flag, exit 0) from present-but-unreadable (error,
  // exit 1). The DEFAULT path resolves desk-suffixed with a one-time legacy
  // migration seed; an explicit --manifest= override is honored as the
  // exact path given (no seed fallback — explicit means explicit).
  let manifestText: string | undefined;
  let legacySeed = false;
  if (manifestPath === DEFAULT_MANIFEST) {
    const resolved = readManifestText(MANIFEST_PATHS);
    manifestText = resolved?.text;
    legacySeed = resolved?.legacySeed === true;
  } else {
    try {
      manifestText = readFileSync(manifestPath, "utf8");
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === "ENOENT") manifestText = undefined;
      else throw err;
    }
  }
  if (legacySeed) {
    console.error(
      `note: ${MANIFEST_PATHS.activePath} absent — using the legacy shared ` +
        `manifest as a ONE-TIME migration seed (desk-suffixed manifests, ` +
        `2026-10-28); if the inherited anchor was the other desk's, the ` +
        `flag below fires once — re-record locally and it stays silent.`,
    );
  }

  let omoText: string;
  try {
    omoText = readFileSync(omoPath, "utf8");
  } catch (err) {
    console.error(
      `Error: resolved omo binding source unreadable: ${omoPath} — ` +
        (err instanceof Error ? err.message : String(err)) +
        ` (fail-closed: the drift check derives state from the per-desk repo ` +
        `variant; set OMO_JSONC_PATH to point at it explicitly)`,
    );
    process.exit(1);
  }
  const currentState = extractModelState(omoText, OMO_REL);

  let result;
  try {
    result = checkDrift(manifestText, currentState);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (json) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else if (result.output !== "") {
    process.stdout.write(result.output + "\n");
  }
  process.exit(0);
}

main();
