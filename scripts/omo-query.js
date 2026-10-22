#!/usr/bin/env node
// scripts/omo-query.js
// JSONC-aware reader for the per-desk REPO omo VARIANT (omo-retire
// 2026-10-22; was ~/.omo/omo.jsonc, retired with the plugin) — used by
// check-completion-honesty.sh and check-doc-claims.sh to validate
// agent/category counts and routing claims.
//
// Source resolution (mirror of scripts/deploy-omo.sh and the
// --omo-source default in generate-pipeline-personas.py — keep the three
// hostname tables in sync):
//   1. OMO_JSONC_PATH env (explicit fixture override, e.g. CI)
//   2. hostname tnt         -> <repo root>/omo.tnt.jsonc
//      hostname dropdeaddev -> <repo root>/omo.ddd.jsonc
// Fail-closed: an unknown hostname or an absent resolved file is a hard
// error — no snapshot, no silent fallback, never the retired ~/.omo path.
//
// Usage:
//   node scripts/omo-query.js agents                — prints agent count
//   node scripts/omo-query.js categories            — prints category count
//   node scripts/omo-query.js categories-routing    — prints JSON {name: {model}}
//   node scripts/omo-query.js path                  — prints the resolved source path

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..');
const OMO_VARIANTS = {
  tnt: 'omo.tnt.jsonc',
  dropdeaddev: 'omo.ddd.jsonc',
};

function resolveOmoPath() {
  const env = process.env.OMO_JSONC_PATH;
  if (env) return env;
  const host = os.hostname().trim().toLowerCase();
  const variant = OMO_VARIANTS[host];
  if (!variant) {
    console.error(
      `Error: unknown hostname '${host}' — no per-desk omo variant case ` +
        `(tnt, dropdeaddev); set OMO_JSONC_PATH or add the host's case in ` +
        `scripts/omo-query.js (mirroring deploy-omo.sh)`
    );
    process.exit(1);
  }
  return path.join(REPO_ROOT, variant);
}

const omoPath = resolveOmoPath();

function stripJsoncComments(text) {
  let result = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\' && i + 1 < text.length) {
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
      } else if (ch === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (ch === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
      } else {
        result += ch;
        i++;
      }
    }
  }
  return result;
}

try {
  if (process.argv[2] === 'path') {
    console.log(omoPath);
    process.exit(0);
  }
  const raw = fs.readFileSync(omoPath, 'utf8');
  const noComments = stripJsoncComments(raw);
  const clean = noComments.replace(/,(?=\s*[}\]])/g, '');
  const config = JSON.parse(clean);
  const oc = config['[opencode]'] || {};

  const query = process.argv[2];
  if (query === 'agents') {
    console.log(Object.keys(oc.agents || {}).length);
  } else if (query === 'categories') {
    console.log(Object.keys(oc.categories || {}).length);
  } else if (query === 'categories-routing') {
    // Shape-tolerant: read 4.19.4 `model`+`fallback_models` FIRST (we stay on
    // that shape deliberately — omo #7209 trap, do NOT convert), then v5 `models[]`.
    const routing = {};
    for (const [name, cfg] of Object.entries(oc.categories || {})) {
      const chain = cfg.models || [];
      const chainFirst = chain[0];
      const model =
        (typeof cfg.model === 'string' && cfg.model) ||
        (typeof chainFirst === 'string' && chainFirst) ||
        (chainFirst && typeof chainFirst === 'object' && chainFirst.model) ||
        '';
      routing[name] = { model };
    }
    console.log(JSON.stringify(routing));
  } else {
    console.error('Usage: omo-query.js <agents|categories|categories-routing|path>');
    process.exit(1);
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error(`Error: resolved omo source not found: ${omoPath}`);
  } else {
    console.error(`Error parsing ${omoPath}: ` + e.message);
  }
  process.exit(1);
}
