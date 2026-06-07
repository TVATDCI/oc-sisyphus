/**
 * Route Mapper - Extract routing architecture from live websites
 * Captures React Router, Next.js, Vue Router configurations
 * 
 * Part of website-analyzer v1.2.0 runtime analysis (Section 18)
 */

class RouteMapper {
  constructor(page, injector) {
    this.page = page;
    this.injector = injector;
    this.routeData = null;
  }

  /**
   * Main entry point: Map all routes and navigation patterns
   * @returns {Promise<Object>} Complete route map
   */
  async map() {
    const routerType = await this.detectRouterType();
    
    if (!routerType) {
      return {
        present: false,
        confidence: 'AMBIGUOUS',
        note: 'No router detected'
      };
    }

    let routes = null;
    let config = null;

    switch (routerType.type) {
      case 'react-router':
        routes = await this.extractReactRouter();
        break;
      case 'nextjs':
        routes = await this.extractNextJS();
        break;
      case 'vue-router':
        routes = await this.extractVueRouter();
        break;
      case 'remix':
        routes = await this.extractRemix();
        break;
      default:
        routes = await this.extractGenericLinks();
    }

    // Extract navigation patterns
    const navigation = await this.extractNavigationPatterns();
    const layouts = await this.detectLayouts();

    this.routeData = {
      present: true,
      confidence: 'EXTRACTED',
      type: routerType.type,
      version: routerType.version,
      routes: routes || [],
      navigation,
      layouts,
      totalRoutes: routes?.length || 0
    };

    return this.routeData;
  }

  /**
   * Detect which router is being used
   */
  async detectRouterType() {
    return await this.page.evaluate(() => {
      const checks = {
        'react-router': {
          present: !!(
            window.__reactRouterVersion ||
            window.__reactRouterContext ||
            window.__reactRouterData ||
            document.querySelector('[data-react-router]')
          ),
          version: window.__reactRouterVersion || 'unknown'
        },
        'nextjs': {
          present: !!(
            window.__NEXT_DATA__ ||
            window.next ||
            document.querySelector('__next') ||
            document.querySelector('#__next')
          ),
          version: window.next?.version || 'unknown'
        },
        'vue-router': {
          present: !!(
            window.__VUE_ROUTER__ ||
            window.VueRouter ||
            document.querySelector('[data-vue-router]')
          ),
          version: 'unknown'
        },
        'remix': {
          present: !!(
            window.__remixContext ||
            document.querySelector('[data-remix]')
          ),
          version: 'unknown'
        },
        'gatsby': {
          present: !!(
            window.___loader ||
            window.___chunkMapping ||
            document.querySelector('[data-gatsby]')
          ),
          version: 'unknown'
        }
      };

      const detected = Object.entries(checks).find(([, v]) => v.present);
      return detected ? { type: detected[0], version: detected[1].version } : null;
    });
  }

  /**
   * Extract React Router routes (v5/v6/v7)
   */
  async extractReactRouter() {
    return await this.page.evaluate(() => {
      const routes = [];

      // Method 1: __reactRouterContext
      if (window.__reactRouterContext) {
        const extractRoutes = (routeList, parentPath = '') => {
          if (!routeList) return;
          
          routeList.forEach(r => {
            const fullPath = parentPath + (r.path || '');
            const routeInfo = {
              path: fullPath || '/',
              component: r.element?.type?.name || r.element?.type?.displayName || 'Anonymous',
              lazy: !!r.lazy,
              hasChildren: !!(r.children && r.children.length > 0),
              index: !!r.index,
              exact: !!r.exact
            };
            routes.push(routeInfo);

            if (r.children) {
              extractRoutes(r.children, fullPath + (fullPath.endsWith('/') ? '' : '/'));
            }
          });
        };

        if (window.__reactRouterContext.route?.routes) {
          extractRoutes(window.__reactRouterContext.route.routes);
        }
      }

      // Method 2: Check for Routes component in React tree
      if (routes.length === 0 && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        try {
          const fiberRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots?.(1);
          if (fiberRoots) {
            fiberRoots.forEach(root => {
              let fiber = root.current;
              let depth = 0;
              
              while (fiber && depth < 1000) {
                depth++;
                
                // Match Route components
                if (fiber.type?.name === 'Route' || fiber.type?.displayName === 'Route') {
                  const props = fiber.memoizedProps || {};
                  routes.push({
                    path: props.path || '/',
                    component: props.component?.name || props.element?.type?.name || 'Unknown',
                    exact: !!props.exact,
                    lazy: false,
                    detectedVia: 'fiber-tree'
                  });
                }
                
                fiber = fiber.child || fiber.sibling;
              }
            });
          }
        } catch (e) {}
      }

      return routes;
    });
  }

  /**
   * Extract Next.js routes
   */
  async extractNextJS() {
    return await this.page.evaluate(() => {
      const routes = [];

      // From __NEXT_DATA__
      if (window.__NEXT_DATA__) {
        const data = window.__NEXT_DATA__;
        
        routes.push({
          path: data.page || '/',
          component: data.page?.replace(/^\//, '') || 'index',
          props: data.props ? Object.keys(data.props) : [],
          buildId: data.buildId,
          lazy: false
        });

        // Check for dynamic routes from script tags
        const scripts = Array.from(document.querySelectorAll('script[src*="_next/static/"'));
        const pageScripts = scripts.filter(s => 
          s.src.includes('/pages/') || s.src.match(/\[.*?\]/)
        );
        
        pageScripts.forEach(s => {
          const match = s.src.match(/pages\/(.+?)\.js/);
          if (match) {
            const path = '/' + match[1].replace(/index$/, '').replace(/\/$/, '');
            if (!routes.some(r => r.path === path)) {
              routes.push({
                path,
                component: match[1],
                detectedVia: 'script-analysis',
                lazy: true
              });
            }
          }
        });
      }

      // Check for _next build manifest
      if (window.__BUILD_MANIFEST__) {
        const pages = window.__BUILD_MANIFEST__;
        Object.keys(pages).forEach(page => {
          const path = page.replace(/^\.\//, '/').replace(/index$/, '').replace(/\/$/, '') || '/';
          if (!routes.some(r => r.path === path)) {
            routes.push({
              path,
              component: page,
              detectedVia: 'build-manifest',
              lazy: false
            });
          }
        });
      }

      return routes;
    });
  }

  /**
   * Extract Vue Router routes
   */
  async extractVueRouter() {
    return await this.page.evaluate(() => {
      const routes = [];

      // Access Vue Router instance
      let router = null;
      
      if (window.__VUE_ROUTER__) {
        router = window.__VUE_ROUTER__;
      } else if (window.VueRouter) {
        // Try to find router in Vue apps
        const vueApps = document.querySelectorAll('[data-v-app]');
        vueApps.forEach(app => {
          if (app.__vue_app__?._container?.__vue_app__?.config?.globalProperties?.$router) {
            router = app.__vue_app__._container.__vue_app__.config.globalProperties.$router;
          }
        });
      }

      if (router && router.options?.routes) {
        const extractVueRoutes = (routeList, parentPath = '') => {
          routeList.forEach(r => {
            const fullPath = parentPath + (r.path || '');
            routes.push({
              path: fullPath || '/',
              component: r.component?.name || r.component?.template?.name || 'Unknown',
              name: r.name,
              lazy: typeof r.component === 'function' && !r.component.name,
              hasChildren: !!(r.children && r.children.length > 0)
            });

            if (r.children) {
              extractVueRoutes(r.children, fullPath + '/');
            }
          });
        };

        extractVueRoutes(router.options.routes);
      }

      return routes;
    });
  }

  /**
   * Extract Remix routes
   */
  async extractRemix() {
    return await this.page.evaluate(() => {
      const routes = [];

      if (window.__remixContext) {
        const manifest = window.__remixContext.routeModules || window.__remixContext.manifest;
        
        if (manifest) {
          Object.entries(manifest).forEach(([id, route]) => {
            routes.push({
              path: route.path || '/',
              component: route.id || id,
              lazy: true,
              hasLoader: !!route.loader,
              hasAction: !!route.action
            });
          });
        }
      }

      return routes;
    });
  }

  /**
   * Fallback: extract all <a> links as generic routes
   */
  async extractGenericLinks() {
    return await this.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const routes = [];
      const seen = new Set();

      links.forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (href.startsWith('http') && !href.includes(window.location.host)) return;

        const path = href.replace(window.location.origin, '').split('?')[0];
        if (seen.has(path)) return;
        seen.add(path);

        routes.push({
          path,
          detectedVia: 'link-analysis',
          text: a.textContent?.trim() || '',
          lazy: false
        });
      });

      return routes;
    });
  }

  /**
   * Extract navigation patterns (links, programmatic navigation)
   */
  async extractNavigationPatterns() {
    return await this.page.evaluate(() => {
      const patterns = {
        links: [],
        programmatic: [],
        guards: []
      };

      // Analyze all navigation links
      const navLinks = document.querySelectorAll('a[href], [role="link"]');
      navLinks.forEach(el => {
        const href = el.getAttribute('href');
        if (href && !href.startsWith('#')) {
          patterns.links.push({
            path: href,
            text: el.textContent?.trim().substring(0, 50) || '',
            external: href.startsWith('http') && !href.includes(window.location.host)
          });
        }
      });

      // Detect React Router Link usage
      const routerLinks = document.querySelectorAll('[data-react-router-link]');
      if (routerLinks.length > 0) {
        patterns.programmatic.push({
          type: 'React Router Link',
          count: routerLinks.length
        });
      }

      // Check for history/navigation globals
      if (typeof window.__reactRouterContext !== 'undefined') {
        patterns.programmatic.push({
          type: 'useNavigate / history.push',
          detectedVia: 'router-context'
        });
      }

      // Scroll behavior
      const scrollHandlers = window.__EVENT_CAPTURE__?.events?.filter(e => 
        e.type === 'scroll'
      ) || [];
      if (scrollHandlers.length > 0) {
        patterns.programmatic.push({
          type: 'scroll-linked navigation',
          count: scrollHandlers.length
        });
      }

      return patterns;
    });
  }

  /**
   * Detect layout hierarchy
   */
  async detectLayouts() {
    return await this.page.evaluate(() => {
      const layouts = [];

      // Detect common layout patterns
      const selectors = {
        'Main Layout': 'main, [role="main"]',
        'Header': 'header, [role="banner"]',
        'Footer': 'footer, [role="contentinfo"]',
        'Sidebar': 'aside, [role="complementary"]',
        'Navigation': 'nav, [role="navigation"]'
      };

      Object.entries(selectors).forEach(([name, selector]) => {
        const el = document.querySelector(selector);
        if (el) {
          layouts.push({
            name,
            element: el.tagName,
            className: el.className?.split(' ')[0] || '',
            present: true
          });
        }
      });

      // Check for React layout components
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        try {
          const fiberRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots?.(1);
          if (fiberRoots) {
            const layoutNames = ['Layout', 'AppLayout', 'PageLayout', 'DefaultLayout'];
            
            fiberRoots.forEach(root => {
              let fiber = root.current;
              let depth = 0;
              
              while (fiber && depth < 500) {
                depth++;
                const name = fiber.type?.name || fiber.type?.displayName;
                
                if (name && layoutNames.some(l => name.includes(l))) {
                  if (!layouts.some(l => l.name === name)) {
                    layouts.push({
                      name,
                      detectedVia: 'react-tree',
                      children: fiber.child ? 1 : 0
                    });
                  }
                }
                
                fiber = fiber.child || fiber.sibling;
              }
            });
          }
        } catch (e) {}
      }

      return layouts;
    });
  }

  /**
   * Convert captured route data to DESIGN.md Section 18 format
   */
  toDesignSection() {
    if (!this.routeData) {
      return '## 18. Route Map & Navigation\n\nNo routing detected.';
    }

    const lines = [];
    lines.push('## 18. Route Map & Navigation');
    lines.push('');

    // Router info
    lines.push('### Router Configuration');
    lines.push(`- **Type:** ${this.routeData.type || 'Unknown'}`);
    if (this.routeData.version && this.routeData.version !== 'unknown') {
      lines.push(`- **Version:** ${this.routeData.version}`);
    }
    lines.push(`- **Total Routes:** ${this.routeData.totalRoutes || 0}`);
    lines.push('');

    // Routes table
    if (this.routeData.routes && this.routeData.routes.length > 0) {
      lines.push('### Route Definitions');
      lines.push('');
      lines.push('| Path | Component | Lazy | Children | Source |');
      lines.push('|------|-----------|------|----------|--------|');

      this.routeData.routes.slice(0, 20).forEach(r => {
        const path = r.path || '/';
        const component = r.component || 'Unknown';
        const lazy = r.lazy ? 'Yes' : 'No';
        const children = r.hasChildren || r.children ? 'Yes' : 'No';
        const source = r.detectedVia || 'runtime';
        
        lines.push(`| ${path} | ${component} | ${lazy} | ${children} | ${source} |`);
      });

      if (this.routeData.routes.length > 20) {
        lines.push(`| ... | ${this.routeData.routes.length - 20} more routes | | | |`);
      }
      lines.push('');
    }

    // Navigation patterns
    if (this.routeData.navigation) {
      const nav = this.routeData.navigation;
      lines.push('### Navigation Patterns');
      
      if (nav.links && nav.links.length > 0) {
        lines.push(`- **Total Links:** ${nav.links.length}`);
        lines.push(`- **External Links:** ${nav.links.filter(l => l.external).length}`);
      }
      
      if (nav.programmatic && nav.programmatic.length > 0) {
        nav.programmatic.forEach(p => {
          lines.push(`- **${p.type}:** ${p.count || 'detected'}`);
        });
      }
      lines.push('');
    }

    // Layouts
    if (this.routeData.layouts && this.routeData.layouts.length > 0) {
      lines.push('### Layout Hierarchy');
      this.routeData.layouts.forEach(l => {
        lines.push(`- **${l.name}:** ${l.element || l.detectedVia || 'detected'}`);
      });
      lines.push('');
    }

    lines.push(`**Confidence:** ${this.routeData.routes?.length > 0 ? 'EXTRACTED' : 'INFERRED'}`);

    return lines.join('\n');
  }
}

module.exports = { RouteMapper };
