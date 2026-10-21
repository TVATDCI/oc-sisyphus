/**
 * sis model-state extraction (shared spec §3) — the per-desk REPO omo
 * VARIANT's agent + category bindings: primary `.model` assignments and
 * `fallback_models` chains, legacy vocabulary only (INV-3). Includes the
 * fixed 64-hex source digest anchor — binding edits drift the digest even
 * when a rename leaves the enumerated count identical.
 *
 * SOURCE (omo-retire 2026-10-22): the model-binding source of truth is the
 * hostname-resolved per-desk REPO VARIANT at the config root — NOT the
 * retired ~/.omo/omo.jsonc. Resolution mirrors scripts/deploy-omo.sh and
 * generate-pipeline-personas.py (keep the three hostname tables in sync):
 * OMO_JSONC_PATH env > tnt→omo.tnt.jsonc / dropdeaddev→omo.ddd.jsonc.
 * Fail-closed: unknown host or absent file is the caller's hard error —
 * no snapshot, no silent fallback.
 *
 * JSONC-aware parsing ONLY (pitfall table: comments + trailing commas break
 * a naive JSON.parse). Repo precedent: `scripts/omo-query.js` — string-aware
 * comment strip + trailing-comma removal, mirrored here (never strip ad hoc).
 *
 * Bounded read (INV-2): the extractor consumes the resolved source TEXT
 * supplied by the caller; the drift check feeds it exactly one file — the
 * model-binding source of truth. Never skill bodies, prompts, or prose.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import process from "node:process";

export type ModelState = {
  source: { path: string; sha256: string };
  bindings: Record<string, string>;
  "fallback-chains": Record<string, string[]>;
};

/** Hostname → per-desk repo variant (mirror of scripts/deploy-omo.sh's case
 * table; omo-query.js and generate-pipeline-personas.py carry the same one). */
export const OMO_VARIANTS: Record<string, string> = {
  tnt: "omo.tnt.jsonc",
  dropdeaddev: "omo.ddd.jsonc",
};

export type OmoSource = { absPath: string; relPath: string };

/** Resolve the model-binding source: OMO_JSONC_PATH env > the hostname-resolved
 * per-desk REPO VARIANT at the config root. Read-only (node:os hostname with an
 * /etc/hostname fallback — stays inside a pure `--allow-read` grant; the env
 * probe is permission-tolerant: a denied read just means the override is not
 * available, the hostname default still resolves). An unknown hostname throws
 * (fail-closed, mirror of deploy-omo.sh's error). */
export function resolveOmoSource(configRoot: string): OmoSource {
  let env: string | undefined;
  try {
    env = process.env.OMO_JSONC_PATH;
  } catch {
    env = undefined; // env permission not granted — override simply unavailable
  }
  if (env !== undefined && env !== "") {
    return { absPath: env, relPath: env };
  }
  let host = "";
  try {
    host = hostname().trim().toLowerCase();
  } catch {
    try {
      host = readFileSync("/etc/hostname", "utf8").trim().toLowerCase();
    } catch {
      host = "";
    }
  }
  const variant = OMO_VARIANTS[host];
  if (variant === undefined) {
    throw new Error(
      `omo source: unknown hostname '${host}' — no per-desk variant case ` +
        `(tnt, dropdeaddev); set OMO_JSONC_PATH or add the host's case in ` +
        `scripts/lib/model-state.ts (mirroring scripts/deploy-omo.sh)`,
    );
  }
  return { absPath: join(configRoot, variant), relPath: variant };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** String-aware JSONC comment strip (mirrors scripts/omo-query.js). */
function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        result += ch + text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      i++;
    } else {
      if (ch === '"') {
        inString = true;
        result += ch;
        i++;
      } else if (ch === "/" && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
      } else if (ch === "/" && text[i + 1] === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
      } else {
        result += ch;
        i++;
      }
    }
  }
  return result;
}

/** JSONC-aware parse: comment strip + trailing-comma removal, then JSON.parse. */
export function parseJsonc(text: string): unknown {
  const clean = stripJsoncComments(text).replace(/,(?=\s*[}\]])/g, "");
  return JSON.parse(clean);
}

function bindingModel(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (isRecord(entry)) {
    const model = entry["model"];
    if (typeof model === "string") return model;
  }
  return "";
}

function chainModels(entry: unknown): string[] {
  if (!isRecord(entry)) return [];
  const chain = entry["fallback_models"];
  if (!Array.isArray(chain)) return [];
  const models: string[] = [];
  for (const item of chain) {
    const model = bindingModel(item);
    if (model !== "") models.push(model);
  }
  return models;
}

export function extractModelState(
  omoText: string,
  relPath: string,
): ModelState {
  const parsed: unknown = parseJsonc(omoText);
  if (!isRecord(parsed)) throw new Error("omo source: top level is not an object");
  const oc = parsed["[opencode]"];
  if (!isRecord(oc)) throw new Error("omo source: [opencode] section missing");
  const bindings: Record<string, string> = {};
  const chains: Record<string, string[]> = {};
  for (const section of ["agents", "categories"]) {
    const group = oc[section];
    if (group === undefined) continue;
    if (!isRecord(group)) throw new Error(`omo source: ${section} is not an object`);
    for (const [name, entry] of Object.entries(group)) {
      const key = `${section}/${name}`;
      bindings[key] = bindingModel(entry);
      chains[key] = chainModels(entry);
    }
  }
  return {
    source: {
      path: relPath,
      sha256: createHash("sha256").update(omoText, "utf8").digest("hex"),
    },
    bindings,
    "fallback-chains": chains,
  };
}
