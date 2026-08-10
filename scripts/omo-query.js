#!/usr/bin/env node
// scripts/omo-query.js
// JSONC-aware reader for ~/.omo/omo.jsonc — used by check-completion-honesty.sh
// and check-doc-claims.sh to validate agent/category counts and routing claims.
//
// Usage:
//   node scripts/omo-query.js agents                — prints agent count
//   node scripts/omo-query.js categories            — prints category count
//   node scripts/omo-query.js categories-routing    — prints JSON {name: {model}}

const fs = require('fs');
const path = require('path');
const os = require('os');

const omoPath = path.join(os.homedir(), '.omo', 'omo.jsonc');

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
    const routing = {};
    for (const [name, cfg] of Object.entries(oc.categories || {})) {
      const m = (cfg.models || [])[0];
      routing[name] = { model: typeof m === 'string' ? m : (m && m.model) || '' };
    }
    console.log(JSON.stringify(routing));
  } else {
    console.error('Usage: omo-query.js <agents|categories|categories-routing>');
    process.exit(1);
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error('Error: ~/.omo/omo.jsonc not found');
  } else {
    console.error('Error parsing ~/.omo/omo.jsonc: ' + e.message);
  }
  process.exit(1);
}
