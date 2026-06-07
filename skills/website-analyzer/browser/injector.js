/**
 * Script Injection Utilities for website-analyzer v1.2.0
 * Provides safe, reliable script injection into Playwright-controlled pages
 */

class Injector {
  constructor(page, options = {}) {
    this.page = page;
    this.options = {
      timeout: options.timeout || 30000,
      retryCount: options.retryCount || 3,
      ...options
    };
    this.injectedScripts = new Map();
  }

  /**
   * Inject raw JavaScript code into the page
   * @param {string} script - JavaScript code to execute
   * @param {object} args - Arguments to pass to the script
   * @returns {Promise<any>} - Result of the script execution
   */
  async inject(script, args = {}) {
    const scriptId = `inject_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const result = await this.page.evaluate((scriptCode, scriptArgs, id) => {
        try {
          // Create a safe execution context
          const fn = new Function('args', `
            try {
              ${scriptCode}
            } catch (err) {
              return { __error: err.message, __stack: err.stack };
            }
          `);
          const result = fn(scriptArgs);
          return { __success: true, __id: id, result };
        } catch (err) {
          return { __error: err.message, __stack: err.stack, __id: id };
        }
      }, script, args, scriptId);
      
      if (result?.__error) {
        throw new Error(`Script injection failed: ${result.__error}`);
      }
      
      this.injectedScripts.set(scriptId, { script, timestamp: Date.now() });
      return result?.result;
    } catch (error) {
      if (this.options.retryCount > 0) {
        this.options.retryCount--;
        await this.page.waitForTimeout(500);
        return this.inject(script, args);
      }
      throw error;
    }
  }

  /**
   * Inject a script file into the page
   * @param {string} filePath - Path to JavaScript file
   */
  async injectFile(filePath) {
    const fs = require('fs');
    const path = require('path');
    
    const fullPath = path.resolve(filePath);
    const script = fs.readFileSync(fullPath, 'utf8');
    
    return await this.inject(script);
  }

  /**
   * Wait for a library or global object to be available
   * @param {string} name - Global variable name to wait for
   * @param {number} timeout - Maximum wait time in ms
   */
  async waitForLibrary(name, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const exists = await this.page.evaluate((libName) => {
        return window[libName] !== undefined;
      }, name);
      
      if (exists) {
        return true;
      }
      
      await this.page.waitForTimeout(200);
    }
    
    return false;
  }

  /**
   * Wait for multiple libraries
   * @param {string[]} names - Array of global variable names
   * @param {number} timeout - Maximum wait time in ms
   */
  async waitForLibraries(names, timeout = 10000) {
    const results = {};
    
    await Promise.all(
      names.map(async (name) => {
        results[name] = await this.waitForLibrary(name, timeout);
      })
    );
    
    return results;
  }

  /**
   * Wait for a specific DOM condition
   * @param {string} selector - CSS selector
   * @param {number} timeout - Maximum wait time
   */
  async waitForElement(selector, timeout = 10000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for page to be fully loaded including lazy assets
   */
  async waitForFullLoad() {
    await this.page.waitForLoadState('networkidle');
    
    // Additional wait for React/Vue/Angular hydration
    await this.page.evaluate(() => {
      return new Promise((resolve) => {
        // Check if React is present and hydrated
        if (window.__REACT_LOADED__) {
          resolve(true);
          return;
        }
        
        // Check for Next.js
        if (window.__NEXT_DATA__ && document.querySelector('__next')) {
          resolve(true);
          return;
        }
        
        // Generic fallback
        if (document.readyState === 'complete') {
          resolve(true);
          return;
        }
        
        window.addEventListener('load', () => resolve(true));
        setTimeout(() => resolve(true), 2000); // Fallback timeout
      });
    });
  }

  /**
   * Extract data using a template function
   * @param {Function} extractorFn - Function to run in page context
   * @param {any} args - Arguments for the extractor
   */
  async extract(extractorFn, args = {}) {
    const serialized = extractorFn.toString();
    return await this.inject(`
      const extractor = ${serialized};
      return extractor(args);
    `, args);
  }

  /**
   * Run multiple extractions in parallel
   * @param {Object.<string, Function>} extractors - Map of name to extractor function
   */
  async extractAll(extractors) {
    const results = {};
    
    await Promise.all(
      Object.entries(extractors).map(async ([name, fn]) => {
        try {
          results[name] = await this.extract(fn);
        } catch (error) {
          results[name] = { __error: error.message };
        }
      })
    );
    
    return results;
  }

  /**
   * Patch a global function to intercept calls
   * @param {string} objectPath - Path to object (e.g., 'window.gsap.to')
   * @param {Function} interceptor - Interceptor function
   */
  async patch(objectPath, interceptor) {
    const patchScript = `
      (function() {
        const parts = '${objectPath}'.split('.');
        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) return false;
        }
        const methodName = parts[parts.length - 1];
        const original = obj[methodName];
        if (!original) return false;
        
        obj[methodName] = function(...args) {
          window.__PATCH_CAPTURE__ = window.__PATCH_CAPTURE__ || {};
          window.__PATCH_CAPTURE__['${objectPath}'] = window.__PATCH_CAPTURE__['${objectPath}'] || [];
          window.__PATCH_CAPTURE__['${objectPath}'].push({
            args: args.map(a => typeof a === 'function' ? '[Function]' : a),
            timestamp: Date.now()
          });
          return original.apply(this, args);
        };
        
        return true;
      })()
    `;
    
    return await this.inject(patchScript);
  }

  /**
   * Create an isolated execution context for complex scripts
   * @param {string} script - Complex script to run safely
   */
  async runInIsolation(script) {
    const isolationWrapper = `
      (function() {
        'use strict';
        const exports = {};
        const module = { exports };
        
        try {
          ${script}
          return { success: true, result: module.exports };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack };
        }
      })()
    `;
    
    return await this.inject(isolationWrapper);
  }

  /**
   * Get the list of all injected scripts
   */
  getInjectedScripts() {
    return Array.from(this.injectedScripts.entries()).map(([id, data]) => ({
      id,
      ...data
    }));
  }

  /**
   * Clear all patches and injected state
   */
  async cleanup() {
    await this.inject(`
      if (window.__PATCH_CAPTURE__) delete window.__PATCH_CAPTURE__;
      if (window.__EVENT_CAPTURE__) {
        EventTarget.prototype.addEventListener = window.__EVENT_CAPTURE__.originalAddEventListener;
        delete window.__EVENT_CAPTURE__;
      }
      if (window.__ANIMATION_CAPTURE__) delete window.__ANIMATION_CAPTURE__;
      if (window.__ZUSTAND_STORES__) delete window.__ZUSTAND_STORES__;
      return true;
    `);
    
    this.injectedScripts.clear();
  }
}

module.exports = { Injector };
