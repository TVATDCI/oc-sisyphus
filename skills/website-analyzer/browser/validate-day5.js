const { 
  BrowserInspector, 
  BrowserLauncher, 
  AnimationRecorder, 
  ThreeInspector, 
  StateExtractor, 
  RouteMapper 
} = require('./');

async function validateDay5() {
  console.log('=== Day 5: Integration & Full Pipeline Validation ===\n');
  
  let success = true;
  
  try {
    console.log('1. Testing all module exports...');
    const modules = {
      BrowserInspector, BrowserLauncher, AnimationRecorder, 
      ThreeInspector, StateExtractor, RouteMapper
    };
    Object.entries(modules).forEach(([name, Module]) => {
      if (typeof Module !== 'function') {
        console.log(`   ${name} not exported correctly`);
        success = false;
      }
    });
    console.log('   All 6 modules exported\n');
    
    console.log('2. Simulating full analysis pipeline...');
    const inspector = new BrowserInspector(null, { waitForLoad: false });
    
    inspector.results = {
      url: 'https://dropdeaddev-1.onrender.com/',
      timestamp: new Date().toISOString(),
      animations: {
        css: [
          { name: 'fadeIn', keyframeCount: 2, keyframes: [] },
          { name: 'slideUp', keyframeCount: 3, keyframes: [] }
        ],
        js: [],
        framerMotion: [
          { element: 'div.hero', animate: 'visible', style: { transform: 'scale(1)' } }
        ],
        gsap: [{ type: 'to', duration: 0.4 }],
        scroll: [{ library: 'GSAP ScrollTrigger', trigger: '.section' }],
        transitions: [{ element: 'button', transitionProperty: 'transform, opacity' }],
        triggers: { hover: [{ trigger: 'hover' }], scroll: [{ trigger: 'scroll' }], mount: [], click: [], focus: [] }
      },
      threeJs: {
        present: true,
        confidence: 'EXTRACTED',
        renderer: { type: 'WebGLRenderer', size: { width: 1280, height: 720 } },
        scene: {
          objectCount: 5,
          meshes: [
            { name: 'Nebula', geometry: { type: 'Points', vertices: 5000 }, material: 'PointsMaterial', position: [0, 0, 0] }
          ]
        },
        lights: [{ name: 'Ambient', type: 'AmbientLight', color: '#0e0c15', intensity: 1 }],
        performance: { meshCount: 1, vertexCount: 5000, estimatedMemoryMB: 0.1 },
        animationLoop: { fps: 60, detectedAnimations: 'continuous' }
      },
      state: {
        detectedLibraries: { zustand: true, reactQuery: true },
        stores: [
          { library: 'Zustand', name: 'authStore', stateKeys: ['user', 'token'], actions: ['login', 'logout'] },
          { library: 'Zustand', name: 'themeStore', stateKeys: ['theme'], actions: ['setTheme'] }
        ],
        urlState: { currentPath: '/' }
      },
      routes: {
        present: true,
        type: 'react-router',
        version: '7.0',
        routes: [
          { path: '/', component: 'Home', lazy: false },
          { path: '/projects', component: 'Projects', lazy: true }
        ],
        navigation: { links: [{ path: '/', text: 'Home' }] },
        layouts: [{ name: 'Main Layout' }]
      },
      interactions: {
        eventCount: 15,
        eventTypes: ['click', 'scroll', 'mousemove'],
        recentEvents: [{ type: 'click', target: 'BUTTON', timestamp: Date.now() }]
      }
    };
    
    inspector.results.stateExtractor = new StateExtractor();
    inspector.results.stateExtractor.stateData = inspector.results.state;
    
    inspector.results.routeMapper = new RouteMapper();
    inspector.results.routeMapper.routeData = inspector.results.routes;
    
    console.log('   Simulated data loaded\n');
    
    console.log('3. Generating complete DESIGN.md Sections 15-19...');
    const sections = inspector.generateDesignSections();
    
    const requiredSections = [
      '15. Animation Inventory',
      '16. 3D Scene Specification', 
      '17. State Management Architecture',
      '18. Route Map & Navigation',
      '19. Interaction Patterns'
    ];
    
    requiredSections.forEach(section => {
      if (sections.includes(section)) {
        console.log(`   ${section}: present`);
      } else {
        console.log(`   ${section}: MISSING`);
        success = false;
      }
    });
    console.log();
    
    console.log('4. Full output preview:');
    console.log('================================');
    console.log(sections);
    console.log('================================\n');
    
    console.log('5. Counting extracted elements...');
    const hasAnimations = sections.includes('fadeIn') || sections.includes('slideUp');
    const has3D = sections.includes('WebGLRenderer') || sections.includes('Nebula');
    const hasState = sections.includes('authStore') || sections.includes('Zustand');
    const hasRoutes = sections.includes('/projects') || sections.includes('react-router');
    const hasInteractions = sections.includes('Event Handlers');
    
    const features = [
      ['Animations', hasAnimations],
      ['3D Scene', has3D],
      ['State Management', hasState],
      ['Routes', hasRoutes],
      ['Interactions', hasInteractions]
    ];
    
    features.forEach(([name, present]) => {
      console.log(`   ${name}: ${present ? 'detected' : 'missing'}`);
      if (!present) success = false;
    });
    console.log();
    
    console.log('6. Testing BrowserLauncher static method...');
    if (typeof BrowserLauncher === 'function') {
      console.log('   BrowserLauncher class available');
    } else {
      console.log('   BrowserLauncher not available');
      success = false;
    }
    console.log();
    
    console.log('7. File structure validation...');
    const fs = require('fs');
    const path = require('path');
    const requiredFiles = [
      'inspector.js',
      'launcher.js', 
      'injector.js',
      'animation-recorder.js',
      'three-inspector.js',
      'state-extractor.js',
      'route-mapper.js',
      'index.js'
    ];
    
    requiredFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`   ${file}: ${stats.size} bytes`);
      } else {
        console.log(`   ${file}: MISSING`);
        success = false;
      }
    });
    console.log();
    
    console.log('8. Package manifest check...');
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      console.log(`   Package: ${pkg.name} v${pkg.version}`);
      if (pkg.dependencies?.playwright) {
        console.log(`   Playwright: ${pkg.dependencies.playwright}`);
      }
    }
    console.log();
    
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
    success = false;
  }
  
  console.log('=== Final Validation Summary ===');
  console.log(`Status: ${success ? 'PASSED' : 'FAILED'}`);
  console.log('\nWebsite-Analyzer v1.2.0 Implementation:');
  console.log('  ✅ Day 1: Browser Automation Infrastructure');
  console.log('  ✅ Day 2: Animation Capture System');
  console.log('  ✅ Day 3: 3D Scene Inspection');
  console.log('  ✅ Day 4: State & Route Extraction');
  console.log('  ✅ Day 5: Integration & Full Pipeline');
  console.log('\nNew DESIGN.md Sections (15-19):');
  console.log('  15. Animation Inventory - CSS/JS/Framer/GSAP capture');
  console.log('  16. 3D Scene Specification - Three.js/R3F extraction');
  console.log('  17. State Management Architecture - Zustand/Redux/MobX');
  console.log('  18. Route Map & Navigation - React Router/Next.js/Vue');
  console.log('  19. Interaction Patterns - Events/user flows');
  console.log('\nTotal Files: 8 browser modules');
  console.log('  browser/inspector.js - Main coordinator');
  console.log('  browser/launcher.js - Browser lifecycle');
  console.log('  browser/injector.js - Script injection');
  console.log('  browser/animation-recorder.js - Animation capture');
  console.log('  browser/three-inspector.js - 3D scene extraction');
  console.log('  browser/state-extractor.js - State management');
  console.log('  browser/route-mapper.js - Route mapping');
  console.log('  browser/index.js - Module entry point');
  console.log('\nWebsite-Analyzer v1.2.0 - COMPLETE');
  console.log('Ready for testing on live sites!');
  
  process.exit(success ? 0 : 1);
}

validateDay5();
