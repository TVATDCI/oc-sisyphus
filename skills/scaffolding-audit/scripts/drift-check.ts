/**
 * Drift-check CLI (sis) — the OPEN-2 session-begin slot consumer.
 *
 * Read-only bounded read (INV-2): opens EXACTLY two files — the state
 * manifest and ~/.omo/omo.jsonc (the model-binding source of truth) — and
 * nothing else. Never writes (run under `deno run --allow-read` — the grant
 * proves it; scope the grant to exactly the two paths for a mechanical
 * bounded-read proof). Output contract (shared spec §4): stale or missing →
 * the single reminder flag on stdout, exit 0; fresh → silence, exit 0;
 * unreadable manifest → explicit error on stderr, exit 1, no rebuild.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { checkDrift } from "./lib/drift.ts";
import { extractModelState, OMO_REL } from "./lib/model-state.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SKILL_DIR = join(SCRIPT_DIR, "..");
const DEFAULT_MANIFEST = join(SKILL_DIR, "state", "manifest.json");
// SKILL_DIR = ~/.config/opencode/skills/scaffolding-audit → four ups = ~
const DEFAULT_OMO = join(
  SKILL_DIR,
  "..",
  "..",
  "..",
  "..",
  ".omo",
  "omo.jsonc",
);

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

  // Distinguish missing (flag, exit 0) from present-but-unreadable (error, exit 1).
  let manifestText: string | undefined;
  try {
    manifestText = readFileSync(manifestPath, "utf8");
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === "ENOENT") manifestText = undefined;
    else throw err;
  }

  const omoText = readFileSync(omoPath, "utf8");
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
