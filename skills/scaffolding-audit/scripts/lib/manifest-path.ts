/**
 * Desk-suffixed manifest paths (captain ruling 2026-10-28) — the two-desk
 * manifest ping-pong kill. Each desk re-anchoring the SINGLE shared
 * state/manifest.json invalidated the other desk's drift check on every
 * pull (realized live via 391dd02: ddd pulling TNT's re-anchor alarmed).
 * The manifest filename is now hostname-suffixed — state/manifest.ddd.json
 * on dropdeaddev, state/manifest.tnt.json on tnt — resolved through the
 * SAME hostname mechanism as the omo variant (model-state.ts,
 * resolveDeskHostname; SCAFFOLD_DESK_HOST env override, OMO_JSONC_PATH
 * keeps precedence for the variant path itself). One source of truth.
 *
 * MIGRATION (one-time, in the manifest.ts recording path): when the
 * suffixed file is absent AND the legacy shared manifest.json is present,
 * the recording run SEEDS the suffixed file from it (byte copy). The
 * legacy file is left in place, untouched — inert; a follow-up per-desk
 * captain commit removes it at leisure. Never a destructive move.
 *
 * READ SEMANTICS after migration: drift/anchor readers open the suffixed
 * file ONLY; the legacy file is read ONLY as a migration seed (suffixed
 * file absent), so a stale shared file can never alarm or silence a desk
 * that already owns its suffixed manifest (cross-desk isolation).
 *
 * GIT: both suffixed files stay TRACKED (per-desk audit records in the
 * shared repo) — each desk commits ONLY its own file, pulls never conflict.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDeskHostname } from "./model-state.ts";

export const LEGACY_MANIFEST_NAME = "manifest.json";

/** Hostname → desk manifest suffix (desk-suffixed manifests, 2026-10-28). */
export const DESK_MANIFEST_SUFFIXES: Record<string, string> = {
  tnt: "tnt",
  dropdeaddev: "ddd",
};

export type ManifestPaths = {
  host: string;
  suffix: string;
  /** this desk's suffixed manifest (state/manifest.<ddd|tnt>.json) */
  activePath: string;
  /** legacy shared manifest.json — inert after migration; read only as seed */
  legacyPath: string;
};

/** Manifest filename for a desk hostname. Fail-closed on an unknown host
 * (mirror of resolveOmoSource's error): an unmapped hostname throws — no
 * silent shared-file fallback, or the ping-pong returns through the back
 * door. */
export function manifestFilenameForHost(host: string): string {
  const suffix = DESK_MANIFEST_SUFFIXES[host];
  if (suffix === undefined) {
    throw new Error(
      `manifest path: unknown hostname '${host}' — no desk suffix case ` +
        `(tnt, dropdeaddev); set SCAFFOLD_DESK_HOST or add the host's case ` +
        `in scripts/lib/manifest-path.ts (mirroring model-state.ts)`,
    );
  }
  return `manifest.${suffix}.json`;
}

/** Resolve this desk's manifest paths inside a state dir (hostname-resolved
 * the same way as the omo variant; see the module doc). */
export function resolveManifestPaths(stateDir: string): ManifestPaths {
  const host = resolveDeskHostname();
  return {
    host,
    suffix: DESK_MANIFEST_SUFFIXES[host] ?? "",
    activePath: join(stateDir, manifestFilenameForHost(host)),
    legacyPath: join(stateDir, LEGACY_MANIFEST_NAME),
  };
}

/** One-time legacy-seed migration (the recording path's migration write):
 * suffixed absent + legacy present → seed the suffixed file from the legacy
 * bytes, leaving the legacy file in place untouched. Returns true when a
 * seed was written. Idempotent — a desk that already owns its suffixed
 * manifest is never touched. */
export function seedSuffixedFromLegacy(paths: ManifestPaths): boolean {
  if (existsSync(paths.activePath)) return false;
  let legacy: string;
  try {
    legacy = readFileSync(paths.legacyPath, "utf8");
  } catch {
    return false; // no readable legacy file — nothing to seed from
  }
  writeFileSync(paths.activePath, legacy, "utf8");
  return true;
}

export type ManifestText = { text: string; legacySeed: boolean };

/** Read-only manifest resolution honoring the migration-seed rule: the
 * suffixed file when present; ELSE the legacy shared file as a one-time
 * migration seed; undefined when neither exists (never audited). Once a
 * desk owns its suffixed manifest the legacy file is never opened — a
 * stale shared file can neither alarm nor silence it. Present-but-
 * unreadable (non-ENOENT) throws, preserving the explicit-error contract.
 */
export function readManifestText(
  paths: ManifestPaths,
): ManifestText | undefined {
  let text: string;
  try {
    text = readFileSync(paths.activePath, "utf8");
  } catch (err) {
    if ((err as { code?: unknown }).code !== "ENOENT") throw err;
    let seed: string;
    try {
      seed = readFileSync(paths.legacyPath, "utf8");
    } catch (seedErr) {
      if ((seedErr as { code?: unknown }).code !== "ENOENT") throw seedErr;
      return undefined;
    }
    return { text: seed, legacySeed: true };
  }
  return { text, legacySeed: false };
}
