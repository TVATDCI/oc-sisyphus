/**
 * sis model-state extraction (shared spec §3) — `omo.jsonc` agent + category
 * bindings: primary `.model` assignments and `fallback_models` chains, legacy
 * vocabulary only (INV-3). Includes the fixed 64-hex source digest anchor —
 * binding edits drift the digest even when a rename leaves the enumerated
 * count identical.
 *
 * JSONC-aware parsing ONLY (pitfall table: comments + trailing commas break
 * a naive JSON.parse). Repo precedent: `scripts/omo-query.js` — string-aware
 * comment strip + trailing-comma removal, mirrored here (never strip ad hoc).
 *
 * Bounded read (INV-2): the extractor consumes omo.jsonc TEXT supplied by the
 * caller; the drift check feeds it exactly one file — the model-binding
 * source of truth. Never skill bodies, prompts, or prose.
 */

import { createHash } from "node:crypto";

export type ModelState = {
  source: { path: string; sha256: string };
  bindings: Record<string, string>;
  "fallback-chains": Record<string, string[]>;
};

export const OMO_REL = "~/.omo/omo.jsonc";

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
  if (!isRecord(parsed)) throw new Error("omo.jsonc: top level is not an object");
  const oc = parsed["[opencode]"];
  if (!isRecord(oc)) throw new Error("omo.jsonc: [opencode] section missing");
  const bindings: Record<string, string> = {};
  const chains: Record<string, string[]> = {};
  for (const section of ["agents", "categories"]) {
    const group = oc[section];
    if (group === undefined) continue;
    if (!isRecord(group)) throw new Error(`omo.jsonc: ${section} is not an object`);
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
