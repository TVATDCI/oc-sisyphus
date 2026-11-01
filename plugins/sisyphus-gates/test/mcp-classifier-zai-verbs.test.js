/**
 * test/mcp-classifier-zai-verbs.test.js — the zai MCP web tier read verbs.
 *
 * MCP-WEB-TIER ship (2026-10-30 landing; captain-ruled follow-up): the zai
 * web tier (web-search-prime, web-reader, zread servers) landed connected
 * but call-blocked — the Layer 3.5 verb heuristic leaves tool names that do
 * not START with a read verb ("web_search_prime", "webReader") unknown →
 * deny-by-default. This pins all four fleet verbs as READ class via an
 * exact-name set, plus near-miss denials (no prefix sloppiness) and the
 * write-regex integrity check.
 *
 * Run: `npm test` or `node --test test/mcp-classifier-zai-verbs.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getMcpClassification,
  _internal as mcpInternal,
} from "../src/mcp-classifier.js";
import { shouldBlockTool } from "../src/gates.js";

// Server prefixes exactly as loadMcpPrefixes() builds them from the
// opencode.json mcp keys (lowercased server name + "_"; the zai servers
// keep their hyphens in the config, and the dispatched tool name carries
// the server prefix as-is).
const ZAI_PREFIXES = [
  "web-search-prime_",
  "web-reader_",
  "zread_",
  // underscore aliases exactly as loadMcpPrefixes() emits them for
  // hyphenated server names
  "web_search_prime_",
  "web_reader_",
];

// Dispatched names as observed in the live 2.2.2 validation session
// (roster: web_search_prime; webReader; zread get_repo_structure/read_file/
// search_doc — evidence lane-mcp-web-tier-2026-10-30).
const ZAI_DISPATCHED_READS = [
  "web-search-prime_web_search_prime",
  "web-reader_webReader",
  "web-reader_WebReader", // case-insensitive dispatch shape
  "zread_search_doc",
  "zread_get_repo_structure",
  // self-naming servers double the prefix; the stripper handles repeats
  "zread_zread_search_doc",
  // underscore-normalized server prefix shape must classify identically
  "web_search_prime_web_search_prime",
];

describe("zai MCP web tier read verbs (MCP-WEB-TIER)", () => {
  test("all four fleet verbs classify as read under the real server prefixes", () => {
    mcpInternal.setPrefixes(ZAI_PREFIXES);
    try {
      for (const tool of ZAI_DISPATCHED_READS) {
        const result = getMcpClassification(tool);
        assert.ok(result, `${tool} should classify as MCP`);
        assert.equal(result.type, "mcp", tool);
        assert.equal(result.classification, "read", tool);
      }
    } finally {
      mcpInternal.resetPrefixes();
    }
  });

  test("read classification lets the calls through shouldBlockTool in approved state", () => {
    mcpInternal.setPrefixes(ZAI_PREFIXES);
    try {
      const st = {
        stateFileExists: true,
        planApproved: true,
        evidenceLogged: true,
        approvalStatus: "approved",
      };
      for (const tool of ZAI_DISPATCHED_READS) {
        const d = shouldBlockTool(tool, { url: "https://example.com" }, st);
        assert.equal(d.blocked, false, `${tool} should pass Layer 3.5`);
      }
    } finally {
      mcpInternal.resetPrefixes();
    }
  });

  test("near-miss verbs stay denied — exact-name set has no prefix sloppiness", () => {
    mcpInternal.setPrefixes(ZAI_PREFIXES);
    try {
      const st = {
        stateFileExists: true,
        planApproved: true,
        evidenceLogged: true,
        approvalStatus: "approved",
      };
      const nearMisses = [
        "web-search-prime_web_search_prime_export", // suffixed sibling
        "web-search-prime_web_search_prim", // truncated name
        "web-reader_webreaderx", // extended name
        "web-search-prime_web_search", // shorter name
      ];
      for (const tool of nearMisses) {
        const result = getMcpClassification(tool);
        assert.ok(result, `${tool} should classify as MCP`);
        assert.equal(result.classification, "unknown", tool);
        const d = shouldBlockTool(tool, { url: "https://example.com" }, st);
        assert.equal(d.blocked, true, `${tool} must deny by default`);
        assert.match(d.reason, /unknown/i, tool);
      }
    } finally {
      mcpInternal.resetPrefixes();
    }
  });

  test("explicit read set does not blunt the write-verb regex", () => {
    mcpInternal.setPrefixes(ZAI_PREFIXES);
    try {
      const result = getMcpClassification("web-reader_write_file");
      assert.equal(result.classification, "write");
      const readResult = getMcpClassification("web-reader_webreader");
      assert.equal(readResult.classification, "read");
    } finally {
      mcpInternal.resetPrefixes();
    }
  });

  test("non-MCP built-ins still return null", () => {
    mcpInternal.resetPrefixes();
    assert.equal(getMcpClassification("web_search_prime"), null);
    assert.equal(getMcpClassification("bash"), null);
  });
});
