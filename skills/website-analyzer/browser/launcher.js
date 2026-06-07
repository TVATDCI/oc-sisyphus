/**
 * Browser Launcher - Creates Playwright browser instances for website-analyzer
 * Supports both direct Playwright and MCP server modes
 * 
 * Day 1: Browser Automation Infrastructure for website-analyzer v1.2.0
 */

const { BrowserInspector } = require('./inspector');

class BrowserLauncher {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false, // Default true
      slowMo: options.slowMo || 0,
      timeout: options.timeout || 30000,
      viewport: options.viewport || { width: 1280, height: 720 },
      userAgent: options.userAgent || null,
      ...options
    };
    this.browser = null;
    this.page = null;
    this.inspector = null;
  }

  /**
   * Launch browser using direct Playwright
   * @returns {Promise<BrowserLauncher>} this for chaining
   */
  async launchDirect() {
    try {
      const { chromium } = require('playwright');
      
      this.browser = await chromium.launch({
        headless: this.options.headless,
        slowMo: this.options.slowMo
      });
      
      this.page = await this.browser.newPage({
        viewport: this.options.viewport,
        ...(this.options.userAgent ? { userAgent: this.options.userAgent } : {})
      });
      
      this.page.setDefaultTimeout(this.options.timeout);
      this.page.setDefaultNavigationTimeout(this.options.timeout);
      
      return this;
    } catch (error) {
      if (error.message.includes('shared libraries') || error.message.includes('no-sandbox')) {
        throw new Error(
          `Browser launch failed due to missing system dependencies. ` +
          `Install with: npx playwright install-deps chromium\n` +
          `Or use MCP mode: launcher.launchMCP()`
        );
      }
      throw new Error(`Failed to launch Playwright browser: ${error.message}`);
    }
  }

  /**
   * Launch browser using Playwright MCP server
   * Requires playwright-mcp to be configured
   * @returns {Promise<BrowserLauncher>} this for chaining
   */
  async launchMCP() {
    try {
      // MCP server handles browser lifecycle
      // We get a page reference via MCP tool calls
      console.log('Using Playwright MCP server for browser control...');
      
      // The actual MCP integration happens at the orchestrator level
      // This method serves as a marker that MCP mode is active
      this.mcpMode = true;
      
      return this;
    } catch (error) {
      throw new Error(`Failed to launch via MCP: ${error.message}`);
    }
  }

  /**
   * Navigate to a URL with robust loading
   * @param {string} url - Target URL
   * @param {object} options - Navigation options
   */
  async navigate(url, options = {}) {
    if (!this.page && !this.mcpMode) {
      throw new Error('Browser not launched. Call launchDirect() or launchMCP() first.');
    }

    const navOptions = {
      waitUntil: options.waitUntil || 'networkidle',
      timeout: options.timeout || this.options.timeout,
      ...options
    };

    try {
      await this.page.goto(url, navOptions);
      
      // Additional wait for hydration on SPAs
      await this.waitForHydration();
      
      return this;
    } catch (error) {
      throw new Error(`Navigation failed for ${url}: ${error.message}`);
    }
  }

  /**
   * Wait for SPA hydration (React, Vue, Angular)
   */
  async waitForHydration() {
    await this.page.evaluate(() => {
      return new Promise((resolve) => {
        // Already hydrated if document is complete
        if (document.readyState === 'complete') {
          // Additional checks for React/Vue hydration
          setTimeout(() => {
            resolve({
              readyState: document.readyState,
              hasReact: !!document.querySelector('[data-reactroot]') || !!window.__REACT_LOADED__,
              hasVue: !!window.__VUE__ || !!document.querySelector('[data-v-app]'),
              hasAngular: !!window.angular
            });
          }, 500);
          return;
        }
        
        window.addEventListener('load', () => {
          setTimeout(() => resolve({
            readyState: document.readyState,
            hasReact: !!document.querySelector('[data-reactroot]') || !!window.__REACT_LOADED__,
            hasVue: !!window.__VUE__ || !!document.querySelector('[data-v-app]'),
            hasAngular: !!window.angular
          }), 500);
        });
      });
    });
  }

  /**
   * Create inspector instance for current page
   */
  createInspector(inspectorOptions = {}) {
    if (!this.page) {
      throw new Error('No page available. Navigate to a URL first.');
    }
    
    this.inspector = new BrowserInspector(this.page, {
      screenshotDir: this.options.screenshotDir,
      waitForLoad: false, // Already handled by navigate
      ...inspectorOptions
    });
    
    return this.inspector;
  }

  /**
   * Quick inspection - one-liner for common use case
   * @param {string} url - URL to inspect
   */
  static async inspect(url, options = {}) {
    const launcher = new BrowserLauncher(options);
    await launcher.launchDirect();
    await launcher.navigate(url);
    const inspector = launcher.createInspector();
    await inspector.initialize(url);
    
    return { launcher, inspector };
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    if (this.inspector) {
      await this.inspector.injector.cleanup().catch(() => {});
    }
    
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    
    this.browser = null;
    this.page = null;
    this.inspector = null;
  }

  /**
   * Get current page info
   */
  getPageInfo() {
    if (!this.page) return null;
    
    return {
      url: this.page.url(),
      title: this.page.title(),
      viewport: this.page.viewportSize(),
      headless: this.options.headless
    };
  }
}

module.exports = { BrowserLauncher };
