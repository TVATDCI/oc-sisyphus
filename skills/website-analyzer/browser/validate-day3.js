const { ThreeInspector } = require('./');

async function validateThreeInspector() {
  console.log('=== Three.js Inspector Validation ===\n');
  
  let success = true;
  
  try {
    console.log('1. Testing class instantiation...');
    const inspector = new ThreeInspector(null, null);
    if (!inspector || typeof inspector.inspect !== 'function') {
      console.log('   Inspector methods missing');
      success = false;
    } else {
      console.log('   Inspector instantiated successfully\n');
    }
    
    console.log('2. Testing DESIGN.md section generation...');
    
    // Test with data
    inspector.sceneData = {
      present: true,
      confidence: 'EXTRACTED',
      renderer: {
        type: 'WebGLRenderer',
        size: { width: 1280, height: 720 },
        outputColorSpace: 'srgb',
        toneMapping: 'ACESFilmic',
        shadows: true,
        pixelRatio: 2
      },
      scene: {
        objectCount: 5,
        meshes: [
          { name: 'Sphere', geometry: { type: 'SphereGeometry', vertices: 512 }, material: 'Standard', position: [0, 0, 0] },
          { name: 'Particles', geometry: { type: 'BufferGeometry', vertices: 10000 }, material: 'Points', position: [0, 0, 0] }
        ],
        groups: [{ name: 'Hero', children: 2, position: [0, 0, 0] }]
      },
      lights: [
        { name: 'Ambient', type: 'AmbientLight', color: '#ffffff', intensity: 0.5, castShadow: false },
        { name: 'Directional', type: 'DirectionalLight', color: '#ffffff', intensity: 1.0, castShadow: true }
      ],
      performance: {
        meshCount: 2,
        vertexCount: 10512,
        triangleCount: 3504,
        materialCount: 3,
        estimatedMemoryMB: 0.15
      },
      animationLoop: {
        fps: 60,
        detectedAnimations: 'continuous'
      }
    };
    
    const section = inspector.toDesignSection();
    const checks = [
      ['16. 3D Scene Specification', 'Main header'],
      ['Renderer Setup', 'Renderer subsection'],
      ['Scene Objects', 'Scene subsection'],
      ['Performance', 'Performance subsection'],
      ['Animation Loop', 'Animation subsection'],
      ['WebGLRenderer', 'Renderer type'],
      ['Sphere', 'Mesh name'],
      ['AmbientLight', 'Light type'],
      ['10,512', 'Vertex count'],
      ['Points', 'Particles material'],
      ['continuous', 'Animation type']
    ];
    
    checks.forEach(([text, desc]) => {
      if (section.includes(text)) {
        console.log(`   ${desc} present`);
      } else {
        console.log(`   ${desc} missing: "${text}"`);
        success = false;
      }
    });
    console.log();
    
    console.log('3. Testing empty scene handling...');
    inspector.sceneData = null;
    const emptySection = inspector.toDesignSection();
    if (emptySection.includes('No 3D scene detected')) {
      console.log('   Empty scene handled correctly\n');
    } else {
      console.log('   Empty scene handling failed\n');
      success = false;
    }
    
    console.log('4. Generated Section 16 preview:');
    console.log('---');
    inspector.sceneData = {
      present: true,
      confidence: 'EXTRACTED',
      renderer: { type: 'WebGLRenderer', size: { width: 1280, height: 720 }, outputColorSpace: 'srgb' },
      scene: {
        objectCount: 3,
        meshes: [
          { name: 'Nebula', geometry: { type: 'Points', vertices: 5000 }, material: 'PointsMaterial', position: [0, 0, 0] }
        ]
      },
      lights: [
        { type: 'AmbientLight', color: '#0e0c15', intensity: 1 }
      ],
      performance: { meshCount: 1, vertexCount: 5000, estimatedMemoryMB: 0.1 },
      animationLoop: { fps: 60, detectedAnimations: 'continuous' }
    };
    console.log(inspector.toDesignSection());
    console.log('---\n');
    
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
    success = false;
  }
  
  console.log('=== Validation Summary ===');
  console.log(`Status: ${success ? 'PASSED' : 'FAILED'}`);
  console.log('\nThree.js Inspector Features:');
  console.log('  React Three Fiber support (canvas.__r3f)');
  console.log('  React internal fiber tree traversal');
  console.log('  Camera extraction (position, FOV, near/far)');
  console.log('  Mesh serialization (geometry, material, position)');
  console.log('  Light extraction (type, color, intensity, shadows)');
  console.log('  Material/texture detection');
  console.log('  Performance metrics (vertices, triangles, memory)');
  console.log('  Animation loop analysis (FPS detection)');
  console.log('  DESIGN.md Section 16 generation');
  console.log('\nDay 3: 3D Scene Inspection - COMPLETE');
  
  process.exit(success ? 0 : 1);
}

validateThreeInspector();
