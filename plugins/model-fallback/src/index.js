/**
 * model-fallback/src/index.js — V2-native model-fallback ladder (P2-b).
 *
 * Captain ruling (backlog-impl, 2026-10-22): adopt a V2-native fallback,
 * BUILT not documented. V2 core has no cross-model fallback config — it has
 * retry-on-same-model (model-retry.ts), transport fallback, and a plugin
 * surface. The native mechanism this plugin composes:
 *
 *   session.hook("retry")  fires on every failed provider attempt with the
 *                          CURRENT model ref, the structured error, and a
 *                          MUTABLE {retry, delay} decision
 *   ctx.session.switchModel the public API that re-points session.model
 *   runner/llm.ts          "retries refresh context" — the next retry
 *                          attempt re-resolves session.model, so a switch
 *                          made inside the retry hook serves THE VERY NEXT
 *                          ATTEMPT of the same step
 *
 * Ladder source: the opencode.json `model_fallback` map, EMITTED by
 * scripts/generate-pipeline-personas.py from the per-desk repo variant's
 * fallback_models stanzas (the omo-era inert records made live again) —
 * key: primary "provider/model", value: ordered rungs "provider/model" or
 * "provider/model#variant". Rungs are catalog-validated by the generator's
 * --check-variants leg (dead rungs break chains; the grok-4.6 class).
 *
 * Behavior:
 *   - only fallback-worthy error types switch (rate-limit, auth, quota,
 *     transport, internal, timeout, no-route, unknown) — request-shape
 *     errors (invalid-request, content-filter, ...) never switch
 *   - sticky per session: each further failure of a rung advances to the
 *     next; the ladder never re-flaps backwards mid-session; a NEW session
 *     starts from the primary again (self-healing restore — no cooldown
 *     state kept)
 *   - every switch logs loudly (the served-model report) and the session
 *     rows record the switched model on subsequent turns (parity-leg
 *     visible)
 *   - ladder exhausted -> normal retry/failure semantics take over
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Error types that a different provider CAN fix (omo-era retry_on_errors
 *  [401,403,404,429,5xx] mapped onto V2's structured types). */
export const FALLBACK_WORTHY_TYPES = new Set([
  "provider.rate-limit",
  "provider.auth",
  "provider.quota",
  "provider.transport",
  "provider.internal",
  "provider.timeout",
  "provider.no-route",
  "provider.unknown",
]);

/** Config-roots search order for the model_fallback block (mirrors the
 *  sisyphus-gates options search: reported dir + ancestors, deployed root,
 *  XDG/home roots). */
export function fallbackConfigSearchPath(directory) {
  const seen = new Set();
  const out = [];
  const push = (d) => {
    if (typeof d === "string" && d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  };
  if (typeof directory === "string" && directory) {
    let current = directory;
    for (let i = 0; i < 10 && current; i++) {
      push(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  try {
    push(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
  } catch {
    /* non-file layout */
  }
  if (process.env.XDG_CONFIG_HOME) push(join(process.env.XDG_CONFIG_HOME, "opencode"));
  if (process.env.HOME) push(join(process.env.HOME, ".config", "opencode"));
  return out;
}

function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Read the `model_fallback` map from the first config root carrying it. */
export function readLadders(directory) {
  for (const candidate of fallbackConfigSearchPath(directory)) {
    for (const fname of ["opencode.json", "opencode.jsonc"]) {
      let raw;
      try {
        raw = readFileSync(join(candidate, fname), "utf8");
      } catch {
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(stripJsonComments(raw));
      } catch {
        continue;
      }
      const ladder = parsed?.model_fallback;
      if (ladder && typeof ladder === "object" && !Array.isArray(ladder)) return ladder;
    }
  }
  return {};
}

/** "provider/model#variant" -> {providerID, id, variant?} (invalid -> null). */
export function parseModelRef(value) {
  if (typeof value !== "string" || !value.includes("/")) return null;
  const [providerID, rest] = value.split("/", 2);
  const [id, variant] = rest.split("#");
  if (!providerID || !id) return null;
  return { providerID, id, ...(variant ? { variant } : {}) };
}

export const refString = (ref) =>
  `${ref?.providerID ?? "?"}/${ref?.id ?? "?"}${ref?.variant ? `#${ref.variant}` : ""}`;

/** Decide the next rung for a session given its failing model ref.
 *  `parked` is the session's ladder position ({head, index}) from a prior
 *  switch, or undefined when the session still sits on its primary.
 *  Returns the rung string or null. Pure (unit-testable). */
export function nextRung(ladders, failingRef, parked) {
  if (parked && typeof parked === "object" && Array.isArray(ladders[parked.head])) {
    const ladder = ladders[parked.head];
    const failing = refString(failingRef);
    const current = ladder[parked.index];
    if (current === failing) return ladder[parked.index + 1] ?? null;
    if (parked.head === `${failingRef?.providerID}/${failingRef?.id}`) return ladder[0] ?? null;
    return null;
  }
  const key = `${failingRef?.providerID}/${failingRef?.id}`;
  const ladder = ladders[key];
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  return ladder[0] ?? null;
}

/** Sessions currently parked on a ladder rung (sessionID -> rung index).
 *  Bounded: a stale map entry only wastes a lookup, but cap it anyway. */
const MAX_TRACKED = 512;

export const modelFallbackDefinition = {
  id: "model-fallback",

  async setup(ctx) {
    const directory = ctx?.location?.directory || process.cwd();
    let ladders = readLadders(directory);
    const rungIndex = new Map();

    // Config changes re-read the ladders (hot reload parity with other
    // config-reading surfaces; cheap, no watcher needed at this scale).
    const refreshLadders = () => {
      ladders = readLadders(directory);
    };
    try {
      await ctx?.event?.subscribe?.(() => {});
    } catch {
      /* event domain optional on some host shapes */
    }

    await ctx.session.hook("retry", async (event) => {
      const { sessionID, model, error } = event;
      const decision = event.decision;
      if (!decision || decision.retry === false) return;
      const type = typeof error?.type === "string" ? error.type : "";
      if (!FALLBACK_WORTHY_TYPES.has(type)) return;
      const parked = rungIndex.get(sessionID);
      const rung = nextRung(ladders, model, parked);
      if (!rung) return;
      const target = parseModelRef(rung);
      if (!target) return;
      try {
        await ctx.session.switchModel({ sessionID, model: target });
      } catch (err) {
        console.warn(
          `[model-fallback] session ${sessionID}: switchModel to ${rung} failed (${err?.message ?? err}); staying on ${refString(model)}`
        );
        return;
      }
      const head = parked?.head ?? `${model?.providerID}/${model?.id}`;
      const ladder = ladders[head] ?? [];
      rungIndex.set(sessionID, { head, index: ladder.indexOf(rung) });
      if (rungIndex.size > MAX_TRACKED) {
        rungIndex.delete(rungIndex.keys().next().value);
      }
      if (typeof decision.delay !== "number" || decision.delay < 750) decision.delay = 750;
      decision.retry = true;
      // The served-model REPORT (row evidence follows on the retry attempt).
      console.warn(
        `[model-fallback] session ${sessionID}: ${refString(model)} failed (${type}) -> serving ${rung} (rung ${ladder.indexOf(rung) + 1}/${ladder.length}); actual model now ${rung}`
      );
    });

    return { refreshLadders };
  },
};

export default modelFallbackDefinition;
