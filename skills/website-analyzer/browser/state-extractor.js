/**
 * State Extractor - Capture state management architecture from live websites
 * Extracts Zustand, Redux, MobX, React Context, React Query, URL state
 * 
 * Part of website-analyzer v1.2.0 runtime analysis (Section 17)
 */

class StateExtractor {
  constructor(page, injector) {
    this.page = page;
    this.injector = injector;
    this.stores = [];
    this.stateData = null;
  }

  /**
   * Main entry point: Extract all state management systems
   * @returns {Promise<Object>} Complete state architecture
   */
  async extract() {
    const results = {
      stores: [],
      urlState: null,
      stateManagementCount: 0,
      primaryLibrary: 'Unknown'
    };

    // Detect libraries
    const libDetect = await this.detectLibraries();
    results.detectedLibraries = libDetect;

    // Extract stores based on detected libraries
    if (libDetect.zustand) {
      const zustandStores = await this.extractZustand();
      results.stores.push(...zustandStores);
    }

    if (libDetect.redux) {
      const reduxStore = await this.extractRedux();
      if (reduxStore) results.stores.push(reduxStore);
    }

    if (libDetect.mobx) {
      const mobxStores = await this.extractMobX();
      results.stores.push(...mobxStores);
    }

    // Always try these
    const contextData = await this.extractReactContext();
    results.stores.push(...contextData);

    const queryData = await this.extractReactQuery();
    results.stores.push(...queryData);

    // URL state
    results.urlState = await this.extractURLState();

    // Stats
    results.stateManagementCount = results.stores.length;
    results.primaryLibrary = this.detectPrimaryLibrary(results.stores);

    this.stateData = results;
    return results;
  }

  /**
   * Detect which state libraries are present
   */
  async detectLibraries() {
    return await this.page.evaluate(() => {
      return {
        zustand: !!(
          window.zustand ||
          window.create ||
          Object.keys(window).some(k => k.toLowerCase().includes('zustand'))
        ),
        redux: !!(
          window.__REDUX_DEVTOOLS_EXTENSION__ ||
          window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ ||
          (window.store && typeof window.store.getState === 'function') ||
          Object.keys(window).some(k => k.toLowerCase().includes('redux'))
        ),
        mobx: !!(
          window.mobx ||
          window.mobxReact ||
          Object.keys(window).some(k => k.toLowerCase().includes('mobx'))
        ),
        reactQuery: !!(
          window.__REACT_QUERY_GLOBALS__ ||
          Object.keys(window).some(k => k.toLowerCase().includes('tanstack') || k.toLowerCase().includes('reactquery'))
        ),
        recoil: !!(
          window.Recoil ||
          Object.keys(window).some(k => k.toLowerCase().includes('recoil'))
        ),
        jotai: !!(
          window.jotai ||
          Object.keys(window).some(k => k.toLowerCase().includes('jotai'))
        )
      };
    });
  }

  /**
   * Extract Zustand stores with comprehensive detection
   */
  async extractZustand() {
    return await this.page.evaluate(() => {
      const stores = [];
      
      // Method 1: Hook zustand.create if present
      if (window.zustand?.create || window.create) {
        const originalCreate = window.zustand?.create || window.create;
        if (originalCreate && !window.__ZUSTAND_HOOKED__) {
          window.__ZUSTAND_HOOKED__ = true;
          window.__ZUSTAND_STORES__ = [];
          
          const hookedCreate = (...args) => {
            const store = originalCreate(...args);
            const state = store.getState();
            
            const storeInfo = {
              library: 'Zustand',
              name: args[0]?.name || 'anonymous',
              stateKeys: Object.keys(state).filter(k => typeof state[k] !== 'function'),
              actions: Object.keys(state).filter(k => typeof state[k] === 'function'),
              hasPersist: typeof state.persist !== 'undefined',
              timestamp: Date.now()
            };
            
            window.__ZUSTAND_STORES__.push(storeInfo);
            return store;
          };
          
          if (window.zustand) window.zustand.create = hookedCreate;
          if (window.create) window.create = hookedCreate;
        }
      }

      // Method 2: Search DOM for zustand hooks
      const zustandMarkers = document.querySelectorAll('[data-store], [data-zustand]');
      zustandMarkers.forEach(el => {
        stores.push({
          library: 'Zustand (DOM marker)',
          name: el.dataset.store || el.dataset.zustand || 'unknown',
          element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : '')
        });
      });

      // Method 3: Check script sources for zustand imports
      const scripts = Array.from(document.scripts);
      const zustandScripts = scripts.filter(s => 
        s.src && (s.src.includes('zustand') || s.textContent?.includes('zustand'))
      );
      
      if (zustandScripts.length > 0 && stores.length === 0) {
        stores.push({
          library: 'Zustand',
          name: 'inferred',
          detectedVia: 'script-source',
          note: 'Zustand detected in bundle but stores not accessible at runtime'
        });
      }

      // Combine with hooked stores
      if (window.__ZUSTAND_STORES__) {
        stores.push(...window.__ZUSTAND_STORES__);
      }

      return stores;
    });
  }

  /**
   * Extract Redux store with DevTools integration
   */
  async extractRedux() {
    return await this.page.evaluate(() => {
      // Check for Redux DevTools
      const hasDevTools = !!(
        window.__REDUX_DEVTOOLS_EXTENSION__ ||
        window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
      );

      // Find Redux store
      let store = null;
      let storeSource = null;
      
      // Method 1: Common global names
      const possibleNames = ['store', 'reduxStore', '_store', '__store'];
      for (const name of possibleNames) {
        if (window[name] && typeof window[name].getState === 'function') {
          store = window[name];
          storeSource = `window.${name}`;
          break;
        }
      }
      
      // Method 2: React Provider tree
      if (!store && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        try {
          const fiberRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots?.(1);
          if (fiberRoots) {
            fiberRoots.forEach(root => {
              let fiber = root.current;
              let depth = 0;
              while (fiber && depth < 500) {
                if (fiber.type?.displayName === 'Provider' || 
                    fiber.type?.name === 'Provider' ||
                    fiber.type?.name?.includes('Redux')) {
                  const storeProp = fiber.memoizedProps?.store;
                  if (storeProp && typeof storeProp.getState === 'function') {
                    store = storeProp;
                    storeSource = 'react-tree';
                  }
                }
                fiber = fiber.child || fiber.sibling;
                depth++;
              }
            });
          }
        } catch (e) {}
      }

      if (!store) {
        if (hasDevTools) {
          return {
            library: 'Redux',
            name: 'inferred',
            detectedVia: 'redux-devtools',
            hasDevTools: true,
            note: 'Redux DevTools detected but store not accessible'
          };
        }
        return null;
      }

      const state = store.getState();
      const stateKeys = Object.keys(state);
      
      // Detect slices/modules
      const slices = stateKeys.filter(k => 
        typeof state[k] === 'object' && state[k] !== null && !Array.isArray(state[k])
      );

      return {
        library: 'Redux',
        name: 'root',
        stateKeys,
        slices,
        sliceCount: slices.length,
        hasDevTools,
        storeSource,
        middleware: store.middleware ? 'present' : 'none',
        enhancer: store.dispatch !== undefined ? 'present' : 'none'
      };
    });
  }

  /**
   * Extract MobX stores with better detection
   */
  async extractMobX() {
    return await this.page.evaluate(() => {
      const stores = [];
      
      // Check for MobX globals
      const hasMobX = !!(
        window.mobx ||
        window.mobxReact ||
        window.mobxStateTree ||
        Object.keys(window).some(k => k.toLowerCase().includes('mobx'))
      );

      if (!hasMobX) return stores;

      // Scan window for observable objects
      for (const key of Object.keys(window)) {
        try {
          if (key.startsWith('__')) continue;
          
          const obj = window[key];
          if (!obj || typeof obj !== 'object') continue;
          
          // Check for MobX administration
          const isMobX = !!(
            obj.__mobxAdministration ||
            obj.__mobxGlobals ||
            obj.$mobx ||
            (obj.constructor && obj.constructor.name?.includes('Observable')) ||
            (obj._isObservableObject === true)
          );

          if (isMobX) {
            const stateKeys = Object.keys(obj).filter(k => 
              typeof obj[k] !== 'function' && !k.startsWith('__')
            );
            const actions = Object.keys(obj).filter(k => 
              typeof obj[k] === 'function' && !k.startsWith('__')
            );
            
            stores.push({
              library: 'MobX',
              name: key,
              stateKeys,
              actions,
              isObservable: true,
              isMap: obj.__mobxAdministration?.type_ === 'ObservableMap',
              isArray: Array.isArray(obj)
            });
          }
        } catch (e) {}
      }

      return stores;
    });
  }

  /**
   * Extract React Context providers with value inspection
   */
  async extractReactContext() {
    return await this.page.evaluate(() => {
      const contexts = [];
      
      if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        return contexts;
      }

      try {
        const fiberRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots?.(1);
        if (!fiberRoots) return contexts;

        const seenContexts = new Set();

        fiberRoots.forEach(root => {
          let fiber = root.current;
          let depth = 0;
          
          while (fiber && depth < 1000) {
            depth++;
            
            // Detect Context.Provider
            const isProvider = !!(
              fiber.type?.context ||
              fiber.type?._context ||
              fiber.type?.displayName?.includes('Provider')
            );

            if (isProvider) {
              const contextName = fiber.type?.context?.displayName ||
                                fiber.type?._context?.displayName ||
                                fiber.type?.displayName ||
                                fiber.type?.name ||
                                'Unknown';
              
              if (!seenContexts.has(contextName)) {
                seenContexts.add(contextName);
                
                // Try to inspect provider value
                const value = fiber.memoizedProps?.value;
                const valueKeys = value && typeof value === 'object' 
                  ? Object.keys(value).slice(0, 20) // Limit keys
                  : [];

                contexts.push({
                  library: 'React Context',
                  name: contextName,
                  valueKeys,
                  hasValue: value !== undefined,
                  nested: fiber.return?.type?.displayName || null
                });
              }
            }
            
            fiber = fiber.child || fiber.sibling;
          }
        });
      } catch (e) {}

      return contexts;
    });
  }

  /**
   * Extract React Query / TanStack Query configuration
   */
  async extractReactQuery() {
    return await this.page.evaluate(() => {
      const queries = [];
      
      // Check for React Query globals
      if (typeof window.__REACT_QUERY_GLOBALS__ !== 'undefined') {
        queries.push({
          library: 'React Query',
          name: 'queryClient',
          detectedVia: 'globals'
        });
      }

      // Check for QueryClient in React tree
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        try {
          const fiberRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots?.(1);
          if (fiberRoots) {
            fiberRoots.forEach(root => {
              let fiber = root.current;
              let depth = 0;
              
              while (fiber && depth < 500) {
                depth++;
                
                const isQueryProvider = !!(
                  fiber.type?.name === 'QueryClientProvider' ||
                  fiber.type?.displayName === 'QueryClientProvider' ||
                  fiber.type?.name === 'Hydrate'
                );

                if (isQueryProvider) {
                  queries.push({
                    library: 'React Query / TanStack Query',
                    name: fiber.type?.name || 'QueryClientProvider',
                    detectedVia: 'fiber-tree',
                    hasClient: !!fiber.memoizedProps?.client
                  });
                }
                
                // Check for useQuery hooks
                if (fiber.memoizedState && 
                    (fiber.type?.name?.includes('Query') || 
                     fiber.type?.displayName?.includes('Query'))) {
                  queries.push({
                    library: 'React Query',
                    name: fiber.type?.name || 'useQuery',
                    detectedVia: 'hook-usage'
                  });
                }
                
                fiber = fiber.child || fiber.sibling;
              }
            });
          }
        } catch (e) {}
      }

      // Deduplicate
      const seen = new Set();
      return queries.filter(q => {
        const key = q.library + q.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  /**
   * Extract URL state / query parameters
   */
  async extractURLState() {
    return await this.page.evaluate(() => {
      const url = new URL(window.location.href);
      const params = {};
      
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });

      return {
        currentPath: url.pathname,
        queryParams: Object.keys(params).length > 0 ? params : null,
        hash: url.hash || null,
        search: url.search || null
      };
    });
  }

  /**
   * Detect primary state management library from stores
   */
  detectPrimaryLibrary(stores) {
    const counts = {};
    stores.forEach(s => {
      const lib = s.library?.split(' ')[0];
      counts[lib] = (counts[lib] || 0) + 1;
    });
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'Unknown';
  }

  /**
   * Convert captured state data to DESIGN.md Section 17 format
   */
  toDesignSection() {
    if (!this.stateData) {
      return '## 17. State Management Architecture\n\nNo state management detected.';
    }

    const lines = [];
    lines.push('## 17. State Management Architecture');
    lines.push('');

    // Detected libraries summary
    const libs = this.stateData.detectedLibraries || {};
    const detected = Object.entries(libs)
      .filter(([, v]) => v)
      .map(([k]) => k);
    
    if (detected.length > 0) {
      lines.push(`**Detected Libraries:** ${detected.join(', ')}`);
      lines.push('');
    }

    // Primary library
    lines.push(`**Primary Library:** ${this.stateData.primaryLibrary || 'Unknown'}`);
    lines.push(`**Total Stores:** ${this.stateData.stateManagementCount || 0}`);
    lines.push('');

    // Store inventory
    if (this.stateData.stores && this.stateData.stores.length > 0) {
      lines.push('### Store Inventory');
      lines.push('');

      this.stateData.stores.forEach((store, index) => {
        lines.push(`#### Store ${index + 1}: ${store.name || 'Unnamed'}`);
        lines.push(`- **Library:** ${store.library || 'Unknown'}`);
        
        if (store.stateKeys && store.stateKeys.length > 0) {
          lines.push(`- **State Keys:** ${store.stateKeys.slice(0, 15).join(', ')}${store.stateKeys.length > 15 ? ` (+${store.stateKeys.length - 15} more)` : ''}`);
        }
        
        if (store.actions && store.actions.length > 0) {
          lines.push(`- **Actions:** ${store.actions.slice(0, 10).join(', ')}${store.actions.length > 10 ? ` (+${store.actions.length - 10} more)` : ''}`);
        }
        
        if (store.slices && store.slices.length > 0) {
          lines.push(`- **Slices:** ${store.slices.join(', ')}`);
        }
        
        if (store.hasDevTools !== undefined) {
          lines.push(`- **DevTools:** ${store.hasDevTools ? 'Enabled' : 'Disabled'}`);
        }
        
        if (store.hasPersist) {
          lines.push(`- **Persistence:** Yes`);
        }
        
        if (store.detectedVia) {
          lines.push(`- **Detection Method:** ${store.detectedVia}`);
        }
        
        lines.push('');
      });
    }

    // URL state
    if (this.stateData.urlState) {
      const us = this.stateData.urlState;
      lines.push('### URL State');
      lines.push(`- **Current Path:** ${us.currentPath}`);
      if (us.queryParams) {
        lines.push(`- **Query Params:** ${JSON.stringify(us.queryParams)}`);
      }
      if (us.hash) {
        lines.push(`- **Hash:** ${us.hash}`);
      }
      lines.push('');
    }

    lines.push(`**Confidence:** ${this.stateData.stores?.length > 0 ? 'EXTRACTED' : 'AMBIGUOUS'}`);

    return lines.join('\n');
  }
}

module.exports = { StateExtractor };
