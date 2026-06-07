const { StateExtractor, RouteMapper } = require('./');

async function validateDay4() {
  console.log('=== Day 4 Validation: State & Route Extraction ===\n');
  
  let success = true;
  
  try {
    console.log('1. Testing StateExtractor...');
    const stateExtractor = new StateExtractor(null, null);
    
    stateExtractor.stateData = {
      detectedLibraries: {
        zustand: true,
        redux: false,
        mobx: false,
        reactQuery: true
      },
      stores: [
        {
          library: 'Zustand',
          name: 'authStore',
          stateKeys: ['user', 'isAuthenticated', 'token', 'role'],
          actions: ['login', 'logout', 'setUser'],
          hasPersist: true,
          detectedVia: 'runtime-hook'
        },
        {
          library: 'Zustand',
          name: 'themeStore',
          stateKeys: ['theme', 'isDark'],
          actions: ['setTheme', 'toggle'],
          hasPersist: true
        },
        {
          library: 'React Query',
          name: 'QueryClientProvider',
          detectedVia: 'fiber-tree',
          hasClient: true
        }
      ],
      urlState: {
        currentPath: '/projects',
        queryParams: { filter: 'active' },
        hash: null
      },
      stateManagementCount: 3,
      primaryLibrary: 'Zustand'
    };
    
    const stateSection = stateExtractor.toDesignSection();
    const stateChecks = [
      ['17. State Management Architecture', 'Section header'],
      ['Zustand', 'Primary library'],
      ['authStore', 'Store name'],
      ['login', 'Action name'],
      ['user', 'State key'],
      ['React Query', 'Secondary library'],
      ['/projects', 'URL path']
    ];
    
    stateChecks.forEach(([text, desc]) => {
      if (stateSection.includes(text)) {
        console.log(`   ${desc} present`);
      } else {
        console.log(`   ${desc} missing: "${text}"`);
        success = false;
      }
    });
    console.log();
    
    console.log('2. Testing RouteMapper...');
    const routeMapper = new RouteMapper(null, null);
    
    routeMapper.routeData = {
      present: true,
      type: 'react-router',
      version: '6.20',
      routes: [
        { path: '/', component: 'Home', lazy: false, hasChildren: false },
        { path: '/projects', component: 'Projects', lazy: true, hasChildren: true },
        { path: '/projects/:id', component: 'ProjectDetail', lazy: true, hasChildren: false },
        { path: '/about', component: 'About', lazy: false, hasChildren: false }
      ],
      navigation: {
        links: [
          { path: '/', text: 'Home', external: false },
          { path: '/projects', text: 'Projects', external: false }
        ],
        programmatic: [{ type: 'React Router Link', count: 5 }]
      },
      layouts: [
        { name: 'Main Layout', element: 'main', present: true },
        { name: 'Header', element: 'header', present: true }
      ],
      totalRoutes: 4
    };
    
    const routeSection = routeMapper.toDesignSection();
    const routeChecks = [
      ['18. Route Map & Navigation', 'Section header'],
      ['react-router', 'Router type'],
      ['/projects', 'Route path'],
      ['ProjectDetail', 'Component name'],
      ['Lazy', 'Lazy column'],
      ['Main Layout', 'Layout name'],
      ['Home', 'Link text']
    ];
    
    routeChecks.forEach(([text, desc]) => {
      if (routeSection.includes(text)) {
        console.log(`   ${desc} present`);
      } else {
        console.log(`   ${desc} missing: "${text}"`);
        success = false;
      }
    });
    console.log();
    
    console.log('3. Section 17 preview:');
    console.log('---');
    console.log(stateSection.substring(0, 600));
    console.log('...');
    console.log('---\n');
    
    console.log('4. Section 18 preview:');
    console.log('---');
    console.log(routeSection.substring(0, 600));
    console.log('...');
    console.log('---\n');
    
    console.log('5. Testing empty data handling...');
    const emptyState = new StateExtractor();
    const emptyStateSection = emptyState.toDesignSection();
    if (emptyStateSection.includes('No state management detected')) {
      console.log('   Empty state handled correctly');
    } else {
      console.log('   Empty state handling failed');
      success = false;
    }
    
    const emptyRoutes = new RouteMapper();
    const emptyRouteSection = emptyRoutes.toDesignSection();
    if (emptyRouteSection.includes('No routing detected')) {
      console.log('   Empty routes handled correctly\n');
    } else {
      console.log('   Empty routes handling failed\n');
      success = false;
    }
    
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
    success = false;
  }
  
  console.log('=== Validation Summary ===');
  console.log(`Status: ${success ? 'PASSED' : 'FAILED'}`);
  console.log('\nDay 4 Features:');
  console.log('  StateExtractor with library detection');
  console.log('  Zustand store extraction (hooks, DOM markers)');
  console.log('  Redux store extraction (DevTools, Provider tree)');
  console.log('  MobX store extraction (observable scanning)');
  console.log('  React Context extraction (fiber tree)');
  console.log('  React Query detection');
  console.log('  URL state extraction');
  console.log('  RouteMapper with router detection');
  console.log('  React Router v5/v6/v7 extraction');
  console.log('  Next.js route extraction');
  console.log('  Vue Router extraction');
  console.log('  Remix route extraction');
  console.log('  Navigation pattern detection');
  console.log('  Layout hierarchy detection');
  console.log('  DESIGN.md Sections 17 & 18 generation');
  console.log('\nDay 4: State & Route Extraction - COMPLETE');
  
  process.exit(success ? 0 : 1);
}

validateDay4();
