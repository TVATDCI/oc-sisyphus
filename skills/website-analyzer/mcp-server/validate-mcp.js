/**
 * MCP Server Validation Script
 * Verifies that the website-analyzer MCP server is correctly structured
 * and that all 3 tools are registered with valid schemas.
 */

const fs = require('fs');
const path = require('path');

let success = true;

function fail(message) {
  console.log(`   ❌ ${message}`);
  success = false;
}

function pass(message) {
  console.log(`   ✅ ${message}`);
}

async function validate() {
  console.log('=== Website-Analyzer MCP Server Validation ===\n');

  // -------------------------------------------------------------------------
  // 1. Check tools-schema.json exists and is valid JSON
  // -------------------------------------------------------------------------
  console.log('1. Checking tools-schema.json...');
  const schemaPath = path.join(__dirname, 'tools-schema.json');
  if (!fs.existsSync(schemaPath)) {
    fail('tools-schema.json not found');
  } else {
    pass('tools-schema.json exists');
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    pass('tools-schema.json is valid JSON');
  } catch (err) {
    fail(`tools-schema.json parse error: ${err.message}`);
    schema = {};
  }

  // -------------------------------------------------------------------------
  // 2. Verify schema structure
  // -------------------------------------------------------------------------
  console.log('\n2. Verifying schema structure...');
  if (!schema.tools || typeof schema.tools !== 'object') {
    fail('Missing or invalid "tools" object in schema');
  } else {
    pass('Schema has "tools" object');
  }

  const expectedTools = ['analyze_website', 'extract_colors', 'inventory_components'];
  const actualTools = schema.tools ? Object.keys(schema.tools) : [];

  for (const toolName of expectedTools) {
    if (!actualTools.includes(toolName)) {
      fail(`Missing tool: ${toolName}`);
    } else {
      const tool = schema.tools[toolName];
      if (tool.name !== toolName) {
        fail(`Tool "${toolName}" has mismatched name property`);
      } else if (!tool.description || typeof tool.description !== 'string') {
        fail(`Tool "${toolName}" missing description`);
      } else if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
        fail(`Tool "${toolName}" missing or invalid inputSchema`);
      } else if (!Array.isArray(tool.inputSchema.required) || !tool.inputSchema.required.includes('url')) {
        fail(`Tool "${toolName}" inputSchema must require "url"`);
      } else {
        pass(`Tool "${toolName}" has correct structure`);
      }
    }
  }

  if (actualTools.length !== expectedTools.length) {
    fail(`Expected ${expectedTools.length} tools, found ${actualTools.length}`);
  }

  // -------------------------------------------------------------------------
  // 3. Check analyze_website sections enum
  // -------------------------------------------------------------------------
  console.log('\n3. Verifying analyze_website sections enum...');
  const analyzeTool = schema.tools?.analyze_website;
  if (analyzeTool) {
    const sectionsProp = analyzeTool.inputSchema?.properties?.sections;
    if (!sectionsProp) {
      fail('analyze_website missing "sections" property');
    } else if (!Array.isArray(sectionsProp.enum)) {
      fail('analyze_website sections is not an enum array');
    } else {
      const expectedEnum = ['all', 'design', 'animations', 'threejs', 'state', 'routes'];
      const hasAll = expectedEnum.every(v => sectionsProp.enum.includes(v));
      if (!hasAll) {
        fail(`analyze_website sections enum missing expected values: ${expectedEnum.join(', ')}`);
      } else {
        pass('analyze_website sections enum is correct');
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Require the MCP server module
  // -------------------------------------------------------------------------
  console.log('\n4. Requiring MCP server module...');
  let mcpModule;
  try {
    mcpModule = require('./index.js');
    pass('MCP server module loaded successfully');
  } catch (err) {
    fail(`Failed to load MCP server module: ${err.message}`);
    mcpModule = {};
  }

  // -------------------------------------------------------------------------
  // 5. Verify module exports
  // -------------------------------------------------------------------------
  console.log('\n5. Verifying module exports...');
  const expectedExports = [
    'createServer',
    'toolsSchema',
    'TOOLS',
    'sdkAvailable',
    'browserModulesAvailable',
    'handleAnalyzeWebsite',
    'handleExtractColors',
    'handleInventoryComponents'
  ];

  for (const exp of expectedExports) {
    if (!(exp in mcpModule)) {
      fail(`Missing export: ${exp}`);
    } else {
      pass(`Export "${exp}" present`);
    }
  }

  // -------------------------------------------------------------------------
  // 6. Verify TOOLS array matches schema
  // -------------------------------------------------------------------------
  console.log('\n6. Verifying TOOLS registration...');
  if (!Array.isArray(mcpModule.TOOLS)) {
    fail('TOOLS is not an array');
  } else if (mcpModule.TOOLS.length !== 3) {
    fail(`Expected 3 tools, found ${mcpModule.TOOLS.length}`);
  } else {
    const toolNames = mcpModule.TOOLS.map(t => t.name);
    const allPresent = expectedTools.every(t => toolNames.includes(t));
    if (!allPresent) {
      fail(`Not all expected tools registered. Found: ${toolNames.join(', ')}`);
    } else {
      pass('All 3 tools registered');
    }
  }

  // -------------------------------------------------------------------------
  // 7. Verify createServer function
  // -------------------------------------------------------------------------
  console.log('\n7. Verifying createServer function...');
  if (typeof mcpModule.createServer !== 'function') {
    fail('createServer is not a function');
  } else {
    pass('createServer is a function');
  }

  // If SDK is available, try creating the server
  if (mcpModule.sdkAvailable) {
    try {
      const server = mcpModule.createServer();
      if (server && typeof server.setRequestHandler === 'function') {
        pass('createServer returns a valid MCP Server instance');
      } else if (server === null) {
        pass('createServer returns null (SDK unavailable, expected)');
      } else {
        fail('createServer did not return a valid MCP Server instance');
      }
    } catch (err) {
      fail(`createServer threw: ${err.message}`);
    }
  } else {
    pass('SDK not installed; skipping server instance check');
  }

  // -------------------------------------------------------------------------
  // 8. Verify tools-schema.json matches module export
  // -------------------------------------------------------------------------
  console.log('\n8. Verifying tools-schema.json matches module export...');
  if (mcpModule.toolsSchema) {
    const moduleToolNames = Object.keys(mcpModule.toolsSchema.tools || {});
    const schemaToolNames = Object.keys(schema.tools || {});
    const match =
      moduleToolNames.length === schemaToolNames.length &&
      moduleToolNames.every(n => schemaToolNames.includes(n));

    if (!match) {
      fail('Module toolsSchema does not match tools-schema.json file');
    } else {
      pass('Module toolsSchema matches tools-schema.json file');
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Validation Summary ===');
  if (success) {
    console.log('MCP Server validation PASSED');
    process.exit(0);
  } else {
    console.log('MCP Server validation FAILED');
    process.exit(1);
  }
}

validate().catch((err) => {
  console.error(`Validation fatal error: ${err.message}`);
  process.exit(1);
});
