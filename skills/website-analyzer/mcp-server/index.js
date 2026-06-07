const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { BrowserLauncher } = require('../browser/launcher');

/**
 * MCP Server for website-analyzer v1.3.0
 * Exposes website analysis tools via Model Context Protocol stdio transport.
 */
class WebsiteAnalyzerMCP {
  constructor() {
    this.server = new Server(
      {
        name: 'website-analyzer',
        version: '1.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  setupTools() {
    // List available tools
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          {
            name: 'analyze_website',
            description: 'Full website analysis (static + runtime). Returns design system, animations, 3D scene, state management, routes, and interactions.',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Target website URL' },
                sections: {
                  type: 'array',
                  items: { enum: ['all', 'design', 'animations', 'threejs', 'state', 'routes'] },
                  description: 'Which analysis sections to include',
                },
              },
              required: ['url'],
            },
          },
          {
            name: 'extract_colors',
            description: 'Quick color palette extraction from a website',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Target website URL' },
              },
              required: ['url'],
            },
          },
          {
            name: 'inventory_components',
            description: 'List all UI components detected on a website',
            inputSchema: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Target website URL' },
              },
              required: ['url'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_website':
            return await this.handleAnalyzeWebsite(args);
          case 'extract_colors':
            return await this.handleExtractColors(args);
          case 'inventory_components':
            return await this.handleInventoryComponents(args);
          default:
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
              ],
              isError: true,
            };
        }
      } catch (error) {
        console.error(`Error in tool ${name}:`, error);
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message, stack: error.stack }) },
          ],
          isError: true,
        };
      }
    });
  }

  async handleAnalyzeWebsite(args) {
    const { url, sections = ['all'] } = args;
    const launcher = new BrowserLauncher({ headless: true });
    let inspector = null;

    try {
      await launcher.launchDirect();
      await launcher.navigate(url);
      inspector = launcher.createInspector();
      await inspector.initialize(url);
      await inspector.runFullAnalysis();

      const results = {};

      if (sections.includes('all') || sections.includes('design')) {
        results.design = inspector.generateDesignSections();
      }
      if (sections.includes('all') || sections.includes('animations')) {
        results.animations = inspector.results.animations;
      }
      if (sections.includes('all') || sections.includes('threejs')) {
        results.threeJs = inspector.results.threeJs;
      }
      if (sections.includes('all') || sections.includes('state')) {
        results.state = inspector.results.state;
      }
      if (sections.includes('all') || sections.includes('routes')) {
        results.routes = inspector.results.routes;
      }

      return {
        content: [
          { type: 'text', text: JSON.stringify(results, null, 2) },
        ],
      };
    } catch (error) {
      if (error.message.includes('shared libraries') || error.message.includes('no-sandbox')) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Browser launch failed',
                message: error.message,
                suggestion: 'Install system dependencies: npx playwright install-deps chromium',
              }),
            },
          ],
          isError: true,
        };
      }
      throw error;
    } finally {
      if (launcher) {
        await launcher.close().catch(() => {});
      }
    }
  }

  async handleExtractColors(args) {
    const { url } = args;
    const launcher = new BrowserLauncher({ headless: true });

    try {
      await launcher.launchDirect();
      await launcher.navigate(url);
      const inspector = launcher.createInspector();
      await inspector.initialize(url);

      // Extract colors via page evaluate
      const colors = await inspector.page.evaluate(() => {
        const colorSet = new Set();
        const elements = document.querySelectorAll('*');
        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          const color = style.color;
          const border = style.borderColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') colorSet.add(bg);
          if (color) colorSet.add(color);
          if (border && border !== 'rgba(0, 0, 0, 0)') colorSet.add(border);
        });

        // Also extract CSS variables
        const cssVars = [];
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules || []) {
              if (rule.style) {
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i];
                  if (prop.startsWith('--') && prop.includes('color')) {
                    cssVars.push({ name: prop, value: rule.style.getPropertyValue(prop) });
                  }
                }
              }
            }
          } catch (e) {
            // Cross-origin stylesheet
          }
        }

        return {
          computedColors: Array.from(colorSet).slice(0, 50),
          cssVariables: cssVars.slice(0, 30),
        };
      });

      return {
        content: [
          { type: 'text', text: JSON.stringify(colors, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: error.message }) },
        ],
        isError: true,
      };
    } finally {
      await launcher.close().catch(() => {});
    }
  }

  async handleInventoryComponents(args) {
    const { url } = args;
    const launcher = new BrowserLauncher({ headless: true });

    try {
      await launcher.launchDirect();
      await launcher.navigate(url);
      const inspector = launcher.createInspector();
      await inspector.initialize(url);

      const components = await inspector.page.evaluate(() => {
        const inventory = {
          buttons: [],
          cards: [],
          inputs: [],
          navigation: [],
          modals: [],
          badges: [],
          tags: [],
          toggles: [],
          tabs: [],
          tooltips: [],
          dialogs: [],
          dropdowns: [],
        };

        // Buttons
        document.querySelectorAll('button, [role="button"], .btn, [class*="button"]').forEach((el) => {
          inventory.buttons.push({ tag: el.tagName, className: el.className, text: el.textContent?.trim().substring(0, 30) });
        });

        // Cards
        document.querySelectorAll('[class*="card"], .card, [class*=" Card"]').forEach((el) => {
          inventory.cards.push({ tag: el.tagName, className: el.className });
        });

        // Inputs
        document.querySelectorAll('input, textarea, select, [class*="input"], [class*="field"]').forEach((el) => {
          inventory.inputs.push({ tag: el.tagName, type: el.type, className: el.className });
        });

        // Navigation
        document.querySelectorAll('nav, [role="navigation"], [class*="nav"], [class*="navbar"]').forEach((el) => {
          inventory.navigation.push({ tag: el.tagName, className: el.className });
        });

        // Modals / Dialogs
        document.querySelectorAll('[role="dialog"], [role="modal"], [class*="modal"], [class*="dialog"], [class*="overlay"]').forEach((el) => {
          inventory.modals.push({ tag: el.tagName, className: el.className });
        });

        // Badges / Tags
        document.querySelectorAll('[class*="badge"], [class*="tag"], [class*="pill"], [class*="chip"]').forEach((el) => {
          inventory.badges.push({ tag: el.tagName, className: el.className, text: el.textContent?.trim() });
        });

        // Tabs
        document.querySelectorAll('[role="tablist"], [class*="tab"]').forEach((el) => {
          inventory.tabs.push({ tag: el.tagName, className: el.className });
        });

        // Tooltips
        document.querySelectorAll('[role="tooltip"], [class*="tooltip"]').forEach((el) => {
          inventory.tooltips.push({ tag: el.tagName, className: el.className });
        });

        // Dropdowns
        document.querySelectorAll('[role="menu"], [class*="dropdown"], [class*="select"]').forEach((el) => {
          inventory.dropdowns.push({ tag: el.tagName, className: el.className });
        });

        // Toggles / Switches
        document.querySelectorAll('[role="switch"], [class*="toggle"], [class*="switch"]').forEach((el) => {
          inventory.toggles.push({ tag: el.tagName, className: el.className });
        });

        // Summarize counts
        const summary = {};
        for (const [key, value] of Object.entries(inventory)) {
          summary[key] = value.length;
        }

        return { summary, details: inventory };
      });

      return {
        content: [
          { type: 'text', text: JSON.stringify(components, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: error.message }) },
        ],
        isError: true,
      };
    } finally {
      await launcher.close().catch(() => {});
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Website Analyzer MCP server running on stdio');
  }
}

if (require.main === module) {
  const server = new WebsiteAnalyzerMCP();
  server.start().catch((err) => {
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  });
}

module.exports = { WebsiteAnalyzerMCP };
