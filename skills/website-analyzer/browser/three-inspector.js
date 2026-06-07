/**
 * Three.js Inspector - Extract 3D scene graph from live websites
 * Captures camera, lights, meshes, materials, and animation loops with performance metrics
 * 
 * Part of website-analyzer v1.2.0 runtime analysis (Section 16)
 */

class ThreeInspector {
  constructor(page, injector) {
    this.page = page;
    this.injector = injector;
    this.sceneData = null;
  }

  /**
   * Main entry point: Inspect Three.js scene with comprehensive extraction
   * @returns {Promise<Object>} Complete scene specification
   */
  async inspect() {
    const hasThreeJS = await this.detectThreeJS();
    
    if (!hasThreeJS) {
      return {
        present: false,
        confidence: 'AMBIGUOUS',
        note: 'No Three.js instance detected on page'
      };
    }

    try {
      const scene = await this.extractSceneGraph();
      const renderer = await this.extractRendererConfig();
      const materials = await this.extractMaterials();
      const lights = await this.extractLights();
      const performance = await this.extractPerformanceMetrics();
      const animationLoop = await this.extractAnimationLoop();

      this.sceneData = {
        present: true,
        confidence: 'EXTRACTED',
        renderer,
        scene,
        materials,
        lights,
        performance,
        animationLoop
      };

      return this.sceneData;
    } catch (error) {
      return {
        present: true,
        confidence: 'PARTIAL',
        error: error.message,
        note: 'Failed to fully extract 3D scene'
      };
    }
  }

  /**
   * Detect if Three.js is loaded with fiber support
   */
  async detectThreeJS() {
    return await this.page.evaluate(() => {
      const checks = {
        windowThree: typeof window.THREE !== 'undefined',
        canvasPresent: document.querySelector('canvas') !== null,
        reactThreeFiber: false,
        fiberContext: false,
        scriptTag: Array.from(document.scripts).some(s => 
          s.src.includes('three') || s.src.includes('react-three')
        )
      };
      
      // Enhanced R3F detection
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'));
        if (fiberKey) {
          checks.reactThreeFiber = true;
        }
        if (canvas.__r3f || canvas.__reactThreeFiber) {
          checks.fiberContext = true;
        }
      }
      
      return checks.windowThree || checks.reactThreeFiber || checks.fiberContext || checks.scriptTag;
    });
  }

  /**
   * Extract complete scene graph from Three.js or R3F
   */
  async extractSceneGraph() {
    return await this.page.evaluate(() => {
      try {
        const scene = {
          camera: null,
          meshes: [],
          groups: [],
          objectCount: 0
        };
        
        let threeScene = null;
        let camera = null;
        const THREE = window.THREE || window.__THREE__;
        
        // Method 1: Direct window.scene
        if (window.scene && window.scene.isScene) {
          threeScene = window.scene;
          camera = window.camera;
        }
        
        // Method 2: React Three Fiber via DOM
        if (!threeScene) {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            // Try R3F v4+ API
            if (canvas.__r3f) {
              const fiber = canvas.__r3f.fiber || canvas.__r3f;
              threeScene = fiber.scene;
              camera = fiber.camera;
            }
            // Try R3F legacy
            if (!threeScene && canvas.__reactThreeFiber) {
              threeScene = canvas.__reactThreeFiber.scene;
              camera = canvas.__reactThreeFiber.camera;
            }
          }
        }
        
        // Method 3: Search global for scene/camera pairs
        if (!threeScene && THREE) {
          for (const key of Object.keys(window)) {
            try {
              const obj = window[key];
              if (obj && obj.isScene) {
                threeScene = obj;
                break;
              }
            } catch (e) {}
          }
        }
        
        // Method 4: Traverse react internal trees for R3F scenes
        if (!threeScene) {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const keys = Object.keys(canvas);
            const fiberKey = keys.find(k => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'));
            if (fiberKey) {
              let fiberNode = canvas[fiberKey];
              let depth = 0;
              while (fiberNode && depth < 100) {
                if (fiberNode.stateNode && fiberNode.stateNode.isScene) {
                  threeScene = fiberNode.stateNode;
                  break;
                }
                fiberNode = fiberNode.child || fiberNode.return;
                depth++;
              }
            }
          }
        }
        
        if (!threeScene) {
          return { error: 'Could not access Three.js scene' };
        }

        // Extract camera
        if (!camera) {
          threeScene.traverse(obj => {
            if (obj.isCamera && !camera) camera = obj;
          });
        }
        
        if (camera) {
          scene.camera = ThreeInspector.prototype.serializeCamera(camera);
        }

        // Traverse scene graph
        threeScene.traverse((obj) => {
          scene.objectCount++;
          
          if (obj.isMesh || obj.isPoints || obj.isLine) {
            scene.meshes.push(ThreeInspector.prototype.serializeObject(obj));
          } else if (obj.isGroup) {
            scene.groups.push({
              name: obj.name || 'unnamed-group',
              children: obj.children.length,
              position: [obj.position.x, obj.position.y, obj.position.z]
            });
          }
        });

        return scene;
      } catch (error) {
        return { error: error.message };
      }
    });
  }

  /**
   * Extract camera details
   */
  async extractCamera() {
    return await this.page.evaluate(() => {
      let camera = null;
      
      // Try various camera sources
      if (window.camera) camera = window.camera;
      
      if (!camera && window.scene) {
        window.scene.traverse(obj => {
          if (obj.isCamera && !camera) camera = obj;
        });
      }
      
      if (!camera) {
        const canvas = document.querySelector('canvas');
        if (canvas && canvas.__r3f) {
          camera = canvas.__r3f.camera || canvas.__r3f.fiber?.camera;
        }
      }
      
      return camera ? ThreeInspector.prototype.serializeCamera(camera) : null;
    });
  }

  /**
   * Extract renderer configuration with enhanced R3F support
   */
  async extractRendererConfig() {
    return await this.page.evaluate(() => {
      let renderer = null;
      
      // Try R3F first
      const canvas = document.querySelector('canvas');
      if (canvas) {
        if (canvas.__r3f) {
          renderer = canvas.__r3f.gl || canvas.__r3f.renderer;
        }
        if (!renderer && canvas.__reactThreeFiber) {
          renderer = canvas.__reactThreeFiber.gl;
        }
      }
      
      // Fallback to window.renderer
      if (!renderer) {
        renderer = window.renderer;
      }
      
      if (!renderer) {
        // Try to infer from canvas
        if (canvas) {
          return {
            type: 'WebGLRenderer (inferred)',
            canvasSize: { 
              width: canvas.clientWidth, 
              height: canvas.clientHeight 
            },
            pixelRatio: window.devicePixelRatio,
            inferred: true
          };
        }
        return { error: 'Renderer not accessible' };
      }

      const info = {
        type: renderer.constructor?.name || 'WebGLRenderer',
        inferred: false
      };
      
      try {
        const size = renderer.getSize ? {
          width: renderer.getSize().width,
          height: renderer.getSize().height
        } : null;
        info.size = size;
      } catch (e) {}
      
      try {
        info.pixelRatio = renderer.getPixelRatio?.() || window.devicePixelRatio;
      } catch (e) {}
      
      try {
        info.outputColorSpace = renderer.outputColorSpace || renderer.outputEncoding || 'srgb';
      } catch (e) {}
      
      try {
        info.toneMapping = renderer.toneMapping !== undefined ? 
          ['None', 'Linear', 'Reinhard', 'Cineon', 'ACESFilmic'][renderer.toneMapping] || renderer.toneMapping 
          : 'none';
      } catch (e) {}
      
      try {
        info.shadows = renderer.shadowMap?.enabled || false;
        if (renderer.shadowMap) {
          info.shadowType = ['Basic', 'PCF', 'PCFSoft'][renderer.shadowMap.type - 1] || 'Unknown';
        }
      } catch (e) {}
      
      try {
        info.antialias = renderer.capabilities?.isWebGL2 || true;
      } catch (e) {}

      return info;
    });
  }

  /**
   * Extract light sources from scene
   */
  async extractLights() {
    return await this.page.evaluate(() => {
      const lights = [];
      let scene = window.scene;
      
      // Try R3F scene
      if (!scene) {
        const canvas = document.querySelector('canvas');
        if (canvas && canvas.__r3f) {
          scene = canvas.__r3f.scene || canvas.__r3f.fiber?.scene;
        }
      }
      
      if (!scene) return lights;
      
      scene.traverse(obj => {
        if (obj.isLight) {
          lights.push(ThreeInspector.prototype.serializeLight(obj));
        }
      });
      
      return lights;
    });
  }

  /**
   * Extract material definitions with texture info
   */
  async extractMaterials() {
    return await this.page.evaluate(() => {
      const materials = new Map();
      
      const extractMaterial = (mat) => {
        if (!mat || materials.has(mat.uuid)) return null;
        
        const info = {
          uuid: mat.uuid,
          type: mat.constructor?.name || 'UnknownMaterial',
          name: mat.name || 'unnamed',
          transparent: mat.transparent,
          opacity: mat.opacity,
          side: ['Front', 'Back', 'Double'][mat.side] || mat.side,
          depthTest: mat.depthTest,
          depthWrite: mat.depthWrite,
          visible: mat.visible
        };

        // Colors
        if (mat.color) {
          try { info.color = '#' + mat.color.getHexString(); } catch (e) {}
        }
        if (mat.emissive) {
          try { info.emissive = '#' + mat.emissive.getHexString(); } catch (e) {}
        }
        if (mat.specular) {
          try { info.specular = '#' + mat.specular.getHexString(); } catch (e) {}
        }

        // Textures
        const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'envMap', 'aoMap', 'bumpMap'];
        textureSlots.forEach(slot => {
          if (mat[slot]) {
            info[slot] = {
              present: true,
              source: mat[slot].image?.src || mat[slot].source?.data ? 'data-uri' : 'generated'
            };
          }
        });

        // PBR properties
        if (mat.roughness !== undefined) info.roughness = mat.roughness;
        if (mat.metalness !== undefined) info.metalness = mat.metalness;
        if (mat.clearcoat !== undefined) info.clearcoat = mat.clearcoat;
        if (mat.clearcoatRoughness !== undefined) info.clearcoatRoughness = mat.clearcoatRoughness;
        if (mat.transmission !== undefined) info.transmission = mat.transmission;
        if (mat.ior !== undefined) info.ior = mat.ior;
        if (mat.wireframe !== undefined) info.wireframe = mat.wireframe;

        // Shader
        if (mat.vertexShader) info.hasVertexShader = true;
        if (mat.fragmentShader) info.hasFragmentShader = true;

        materials.set(mat.uuid, info);
        return info;
      };

      // Find all materials in scene
      let scene = window.scene;
      if (!scene) {
        const canvas = document.querySelector('canvas');
        if (canvas && canvas.__r3f) {
          scene = canvas.__r3f.scene || canvas.__r3f.fiber?.scene;
        }
      }
      
      if (scene) {
        scene.traverse((obj) => {
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(extractMaterial);
            } else {
              extractMaterial(obj.material);
            }
          }
        });
      }

      return Array.from(materials.values());
    });
  }

  /**
   * Extract performance metrics (vertex count, draw calls)
   */
  async extractPerformanceMetrics() {
    return await this.page.evaluate(() => {
      let renderer = null;
      let scene = null;
      let camera = null;
      
      // Try R3F
      const canvas = document.querySelector('canvas');
      if (canvas && canvas.__r3f) {
        const fiber = canvas.__r3f.fiber || canvas.__r3f;
        renderer = fiber.gl;
        scene = fiber.scene;
        camera = fiber.camera;
      }
      
      if (!renderer) renderer = window.renderer;
      if (!scene) scene = window.scene;
      if (!camera) camera = window.camera;
      
      const metrics = {
        meshCount: 0,
        vertexCount: 0,
        triangleCount: 0,
        drawCalls: 0,
        materialCount: 0,
        textureCount: 0,
        estimatedMemoryMB: 0
      };
      
      if (!scene) return metrics;
      
      const uniqueMaterials = new Set();
      const uniqueTextures = new Set();
      
      scene.traverse(obj => {
        if (obj.isMesh) {
          metrics.meshCount++;
          
          if (obj.geometry) {
            const pos = obj.geometry.attributes?.position;
            if (pos) {
              metrics.vertexCount += pos.count;
              const index = obj.geometry.index;
              if (index) {
                metrics.triangleCount += index.count / 3;
              } else {
                metrics.triangleCount += pos.count / 3;
              }
            }
          }
          
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => uniqueMaterials.add(m.uuid));
            } else {
              uniqueMaterials.add(obj.material.uuid);
            }
          }
        }
      });
      
      metrics.materialCount = uniqueMaterials.size;
      metrics.drawCalls = metrics.meshCount; // Approximate
      
      // Estimate memory
      metrics.estimatedMemoryMB = Math.round(
        (metrics.vertexCount * 12 + metrics.triangleCount * 2) / (1024 * 1024) * 100
      ) / 100;
      
      return metrics;
    });
  }

  /**
   * Extract animation loop information with frame counting
   */
  async extractAnimationLoop() {
    return await this.page.evaluate(() => {
      let frameCount = 0;
      const capturedFrames = [];
      
      // Hook requestAnimationFrame
      const originalRAF = window.requestAnimationFrame;
      let startTime = Date.now();
      
      window.requestAnimationFrame = function(callback) {
        frameCount++;
        const now = Date.now();
        if (now - startTime <= 1000) {
          capturedFrames.push({
            frame: frameCount,
            timestamp: now
          });
        }
        return originalRAF.apply(this, arguments);
      };

      return new Promise((resolve) => {
        setTimeout(() => {
          window.requestAnimationFrame = originalRAF;
          
          resolve({
            fps: capturedFrames.length,
            frameInterval: capturedFrames.length > 1 
              ? Math.round(((capturedFrames[capturedFrames.length - 1].timestamp - capturedFrames[0].timestamp) / capturedFrames.length) * 100) / 100
              : 0,
            continuous: capturedFrames.length >= 30,
            detectedAnimations: capturedFrames.length >= 30 ? 'continuous' : capturedFrames.length >= 10 ? 'intermittent' : 'static'
          });
        }, 1200);
      });
    });
  }

  /**
   * Capture canvas screenshot for visual reference
   */
  async captureScreenshot() {
    try {
      const canvas = await this.page.$('canvas');
      if (canvas) {
        return await canvas.screenshot({ type: 'png' });
      }
    } catch (e) {
      // Canvas may not be available
    }
    return null;
  }

  /**
   * Convert captured 3D data to DESIGN.md Section 16 format
   */
  toDesignSection() {
    if (!this.sceneData) {
      return '## 16. 3D Scene Specification\n\nNo 3D scene detected.';
    }

    const lines = [];
    lines.push('## 16. 3D Scene Specification');
    lines.push('');
    
    // Renderer
    lines.push('### Renderer Setup');
    const r = this.sceneData.renderer || {};
    lines.push(`- **Library:** ${this.sceneData.present ? 'Three.js' : 'None detected'}`);
    if (r.type) lines.push(`- **Renderer:** ${r.type}`);
    if (r.size) lines.push(`- **Canvas Size:** ${r.size.width}x${r.size.height}`);
    if (r.outputColorSpace) lines.push(`- **Color Space:** ${r.outputColorSpace}`);
    if (r.toneMapping) lines.push(`- **Tone Mapping:** ${r.toneMapping}`);
    if (r.shadows !== undefined) lines.push(`- **Shadows:** ${r.shadows ? 'Enabled' : 'Disabled'}`);
    lines.push('');
    
    // Camera
    if (this.sceneData.scene?. camera) {
      const cam = this.sceneData.scene.camera;
      lines.push('### Camera');
      lines.push(`- **Type:** ${cam.type || 'PerspectiveCamera'}`);
      lines.push(`- **Position:** [${cam.position?.map(v => Math.round(v * 100) / 100).join(', ')}]`);
      lines.push(`- **FOV:** ${cam.fov}`);
      lines.push(`- **Near/Far:** ${cam.near} / ${cam.far}`);
      lines.push('');
    }
    
    // Scene Graph
    lines.push('### Scene Objects');
    const meshes = this.sceneData.scene?. meshes || [];
    const groups = this.sceneData.scene?. groups || [];
    
    lines.push(`- **Total Objects:** ${this.sceneData.scene?.objectCount || 0}`);
    lines.push(`- **Meshes:** ${meshes.length}`);
    lines.push(`- **Groups:** ${groups.length}`);
    lines.push('');
    
    if (meshes.length > 0) {
      lines.push('#### Key Meshes');
      lines.push('| Mesh | Geometry | Material | Vertices | Position |');
      lines.push('|------|----------|----------|----------|----------|');
      meshes.slice(0, 10).forEach(m => {
        const verts = m.geometry?.vertices;
        const vertStr = typeof verts === 'number' ? verts.toLocaleString() : (verts || '?');
        lines.push(`| ${m.name || 'Unnamed'} | ${m.geometry?.type || 'Unknown'} | ${m.material || 'Unknown'} | ${vertStr} | [${m.position?.map(v => Math.round(v * 10) / 10).join(', ')}] |`);
      });
      if (meshes.length > 10) {
        lines.push(`| ... and ${meshes.length - 10} more | | | | |`);
      }
      lines.push('');
    }
    
    // Lighting
    if (this.sceneData.lights && this.sceneData.lights.length > 0) {
      lines.push('### Lighting');
      lines.push('| Light | Type | Color | Intensity | Shadows |');
      lines.push('|-------|------|-------|-----------|---------|');
      this.sceneData.lights.forEach(l => {
        lines.push(`| ${l.name || 'Unnamed'} | ${l.type} | ${l.color} | ${l.intensity} | ${l.castShadow ? 'Yes' : 'No'} |`);
      });
      lines.push('');
    }
    
    // Performance
    if (this.sceneData.performance) {
      const p = this.sceneData.performance;
      lines.push('### Performance');
      if (p.vertexCount !== undefined) lines.push(`- **Vertices:** ${p.vertexCount.toLocaleString()}`);
      if (p.triangleCount !== undefined) lines.push(`- **Triangles:** ${p.triangleCount.toLocaleString()}`);
      if (p.meshCount !== undefined) lines.push(`- **Meshes:** ${p.meshCount}`);
      if (p.materialCount !== undefined) lines.push(`- **Materials:** ${p.materialCount}`);
      if (p.textureCount !== undefined) lines.push(`- **Textures:** ${p.textureCount}`);
      if (p.estimatedMemoryMB !== undefined) lines.push(`- **Estimated Memory:** ${p.estimatedMemoryMB} MB`);
      lines.push('');
    }
    
    // Animation Loop
    if (this.sceneData.animationLoop) {
      const a = this.sceneData.animationLoop;
      lines.push('### Animation Loop');
      lines.push(`- **FPS Detected:** ${a.fps}`);
      lines.push(`- **Type:** ${a.detectedAnimations}`);
      lines.push('');
    }
    
    lines.push(`**Confidence:** ${this.sceneData.confidence || 'EXTRACTED'}`);
    
    return lines.join('\n');
  }

  // Static helper methods for serialization
  serializeCamera(camera) {
    return {
      type: camera.constructor?.name || 'Camera',
      position: [camera.position.x, camera.position.y, camera.position.z],
      rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: camera.aspect,
      zoom: camera.zoom
    };
  }

  serializeObject(obj) {
    const info = {
      type: obj.constructor?.name || 'Object3D',
      name: obj.name || 'unnamed',
      uuid: obj.uuid,
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      visible: obj.visible,
      castShadow: obj.castShadow,
      receiveShadow: obj.receiveShadow
    };

    if (obj.geometry) {
      info.geometry = {
        type: obj.geometry.constructor?.name || 'BufferGeometry',
        vertices: obj.geometry.attributes?.position?.count || 0
      };
    }

    if (obj.material) {
      info.material = Array.isArray(obj.material) 
        ? obj.material.map(m => m.name || m.uuid)
        : (obj.material.name || obj.material.uuid);
    }

    return info;
  }

  serializeLight(light) {
    return {
      type: light.constructor?.name || 'Light',
      name: light.name || 'unnamed',
      uuid: light.uuid,
      position: [light.position.x, light.position.y, light.position.z],
      color: '#' + (light.color?.getHexString?.() || 'ffffff'),
      intensity: light.intensity,
      distance: light.distance,
      decay: light.decay,
      castShadow: light.castShadow
    };
  }
}

module.exports = { ThreeInspector };
