#!/usr/bin/env node
// verify-plugin-compat.js
//
// Confirms plugins declared in ~/.config/opencode/opencode.json are
// pinned and that their pinned versions are present in opencode's
// package cache. Run after editing opencode.json to validate a pin.
//
// Usage:  node ~/.config/opencode/scripts/verify-plugin-compat.js
// Exit:   0 = PASS, 1 = FAIL (drift detected), 2 = unable to read config
//
// Status levels:
//   OK    — pinned to specific version, cache dir matches
//   INFO  — pinned to specific version, cache dir not yet present
//           (will be resolved on next opencode start)
//   LOCAL — local plugin (no cache check needed)
//   WARN  — pinned to @latest OR cache only has @latest
//   FAIL  — pinned version mismatches what's in the cache

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const CACHE = join(HOME, '.cache/opencode/packages');

// 4C-CI fix: resolve opencode.json in priority order so this script works
// in BOTH environments:
//   1. $OPENCODE_CONFIG env var (explicit override, e.g. in CI)
//   2. $CWD/opencode.json   (CI: repo is checked out at CWD, not $HOME)
//   3. $HOME/.config/opencode/opencode.json (local dev)
// Without this fallback chain, the script exits 2 in CI because the
// runner's $HOME has no opencode config installed there.
function resolveConfigPath() {
  const candidates = [
    process.env.OPENCODE_CONFIG,
    join(process.cwd(), 'opencode.json'),
    join(HOME, '.config/opencode/opencode.json'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[candidates.length - 1]; // for error message
}

const CONFIG = resolveConfigPath();

let fails = 0;
let warns = 0;

function readPinned() {
  try {
    const j = JSON.parse(readFileSync(CONFIG, 'utf8'));
    return Array.isArray(j.plugin) ? j.plugin : [];
  } catch (e) {
    console.error('FAIL: could not read', CONFIG, '\n  ', e.message);
    process.exit(2);
  }
}

function parsePluginEntry(entry) {
  // Handle array-form entries: ["./plugins/name", { options }]
  // opencode supports both "name@version" strings and
  // ["./path/or/name", { ...options }] arrays in the plugin config.
  if (Array.isArray(entry)) {
    const nameOrPath = typeof entry[0] === 'string' ? entry[0] : '';
    if (nameOrPath.startsWith('./') || nameOrPath.startsWith('../')) {
      return { raw: nameOrPath, name: nameOrPath, version: null, isLocalPath: true };
    }
    const m = nameOrPath.match(/^((?:@[^/]+\/)?[^@]+)(?:@(.*))?$/);
    if (!m) return { raw: nameOrPath, name: nameOrPath, version: null };
    return { raw: nameOrPath, name: m[1], version: m[2] || null };
  }
  // String-form entries: "name", "name@version", "@scope/name@1.2.3"
  const m = entry.match(/^((?:@[^/]+\/)?[^@]+)(?:@(.*))?$/);
  if (!m) return { raw: entry, name: entry, version: null };
  return { raw: entry, name: m[1], version: m[2] || null };
}

function isLocalPlugin(name) {
  return name === 'sisyphus-gates' || name === 'oh-my-opencode' || name === './plugins/sisyphus-gates';
}

function cacheDirsFor(name) {
  if (!existsSync(CACHE)) return [];
  return readdirSync(CACHE).filter((d) => d === name || d.startsWith(`${name}@`));
}

function isUnresolvedCacheDir(dirname) {
  return !dirname.includes('@') || dirname.endsWith('@latest');
}

function report(entry) {
  const { raw, name, version } = parsePluginEntry(entry);
  console.log(`Plugin: ${raw}`);

  if (isLocalPlugin(name)) {
    console.log('  STATUS: LOCAL — installed at ~/.config/opencode/plugins/');
    console.log('          no @latest risk, no cache check needed');
    console.log();
    return;
  }

  if (!version) {
    console.log('  STATUS: WARN — no @version in entry');
    console.log(`          RECOMMENDATION: pin to a specific version, e.g. ${name}@4.7.5`);
    warns++;
    console.log();
    return;
  }

  if (version === 'latest') {
    console.log('  STATUS: WARN — pinned to @latest, will re-resolve on next opencode start');
    console.log(`          RECOMMENDATION: pin to a specific version, e.g. ${name}@4.7.5`);
    console.log('          Run `npm view <name> version` to find the current published version.');
    warns++;
    console.log();
    return;
  }

  const dirs = cacheDirsFor(name);
  const exact = dirs.find((d) => d === `${name}@${version}`);

  if (exact) {
    console.log(`  STATUS: OK — pinned ${name}@${version}, cache dir "${exact}" present`);
  } else if (dirs.length === 0) {
    console.log(`  STATUS: INFO — pinned to ${name}@${version}, no cache yet`);
    console.log('          Will be resolved on next opencode start.');
  } else if (dirs.every(isUnresolvedCacheDir)) {
    console.log(`  STATUS: WARN — pinned to ${version} but cache is unresolved`);
    console.log(`          Cache dirs: ${dirs.join(', ')}`);
    console.log('          BENIGN: opencode will re-resolve to the pinned version on next start.');
    console.log('          To force resolution now: rm -rf ' + join(CACHE, dirs[0]) + ' and restart opencode');
    warns++;
  } else {
    const unresolved = dirs.filter((d) => !isUnresolvedCacheDir(d));
    console.log(`  STATUS: FAIL — pinned to ${version} but cache has different version(s)`);
    console.log(`          Cache dirs: ${dirs.join(', ')}`);
    console.log(`          Mismatched: ${unresolved.join(', ')}`);
    console.log('          To re-resolve: rm -rf ' + join(CACHE, unresolved[0]) + ' and restart opencode');
    fails++;
  }
  console.log();
}

console.log('Sisyphus Plugin Compatibility Check');
console.log('====================================');
console.log('Config:', CONFIG);
console.log('Cache: ', CACHE);
console.log();

for (const entry of readPinned()) report(entry);

console.log('---');
console.log(
  `Result: ${fails === 0 ? 'PASS' : 'FAIL'} (${fails} fail, ${warns} warn)`
);
process.exit(fails === 0 ? 0 : 1);
