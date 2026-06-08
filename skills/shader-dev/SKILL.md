---
name: shader-dev
description: |
  Constrained WebGL2 fragment-shader development skill. Use this skill whenever the user asks for GLSL shaders, WebGL effects, fragment shaders, shaderToy-style code, 2D SDF graphics, procedural noise, color palette generation, UV transforms, post-processing effects, or basic raymarching. Also use when the user mentions shader compilation, GLSL errors, WebGL rendering, or canvas visual effects. This skill produces verified, compile-checked fragment shaders using a fixed WebGL2 harness. Triggers on: shader, GLSL, WebGL, fragment shader, SDF, raymarching, procedural noise, color palette, post-processing, vignette, chromatic aberration, grain, tone mapping, UV transform.
triggers:
  - shader
  - GLSL
  - WebGL
  - fragment shader
  - SDF
  - raymarching
  - procedural noise
  - color palette
  - post-processing
  - vignette
  - chromatic aberration
  - grain
  - tone mapping
  - UV transform
compatibility:
  requires: [webfetch, bash]
  browsers: [chromium, firefox]
mode: subagent
metadata:
  author: Sisyphus
  version: 1.0.0
  category: graphics
---

## Identity & Scope

**Purpose:** Generate compile-verified WebGL2 fragment shaders using prescriptive recipe templates.

**Entry Criteria:**
- [ ] User names a specific technique family (from the 6 supported categories)
- [ ] User provides parameters or a reference description, OR accepts default parameters
- [ ] Output is a single .html file or the fragment shader code for integration

**Produces:**
- `.html` file containing the shader embedded in the fixed WebGL2 harness
- Or: raw fragment shader code + list of required uniforms

**Scope:**
- ✅ WebGL2 fragment shaders only
- ✅ 6 technique families (see Technique Routing)
- ✅ Fixed WebGL2 harness with ShaderToy-compatible uniforms
- ✅ Compile-first verification
- ❌ WebGPU, DX12, Vulkan, Metal
- ❌ Multipass (FBO ping-pong, fluid sims)
- ❌ Path tracing / global illumination
- ❌ Audio shaders
- ❌ Engine integration (Three.js, R3F, Unity)
- ❌ "Make it look cool" without technique specification
- ❌ Compute shaders

## Mandatory Workflow (6 Steps)

**Step 1 — Classify the request.**
Read the user's request and map it to ONE technique family from the Technique Routing Table. If it maps to none, refuse and suggest the closest match.

**Step 2 — Load the recipe.**
Select the appropriate recipe template from `reference/techniques/`. Recipes are parameter-adaptable, not blank-slate generative. Replace `{{PARAMS}}` with user-provided values; keep defaults for unspecified parameters.

**Parameter Type Safety:** JavaScript number-to-string conversion strips trailing decimals (e.g., `5.0` becomes `"5"`). In GLSL ES 3.0, `"5"` is an `int`, not a `float`. This causes compile errors like `no operation '*' exists that takes a left-hand operand of type 'highp float' and a right operand of type 'const int'`. **Always wrap float parameters with `float()` in the generated shader:**
- `float({{SCALE}})` not `{{SCALE}}`
- `float({{RADIUS}})` not `{{RADIUS}}`
- `float({{MAX_DIST}})` not `{{MAX_DIST}}`
Int parameters (e.g., `{{OCTAVES}}`, `{{MAX_STEPS}}`) do not need `float()`.

**Step 3 — Generate the fragment shader body.**
Write ONLY the fragment shader `main()` body and any helper functions. Do NOT write vertex shaders, WebGL bootstrap, or canvas setup. The harness handles all API wiring.

**Step 4 — Embed in harness.**
Substitute `{{FRAGMENT_SHADER}}` and `{{UNIFORM_BLOCK}}` into `reference/webgl2-harness.html`. The harness provides: `iTime`, `iResolution`, `iMouse`, `iFrame`.

**Step 5 — Compile-verify.**
Run the generated HTML in a headless browser (Playwright or equivalent). Check:
1. **Compile:** Zero GLSL compile/link errors
2. **Non-black frame:** Canvas shows visible pixels (pixel variance > 0.01). A shader that compiles but renders black is still a failure — common in raymarching when the ray direction points away from the scene.
3. **No JS errors:** Console has zero JavaScript errors

**Critical:** Compile success alone is insufficient. A raymarching shader with `rd = normalize(vec3(uv, +1.0))` will compile but show a black screen because the ray points in +z (away from the scene). Always verify the screenshot is non-black.

**Step 6 — Deliver or debug.**
If verification passes: deliver the HTML file or fragment shader code.
If verification fails: run the Debugging Checklist (max 2 iterations). If still failing, switch to shader-debug mode — explain probable causes, do NOT write more shader code.

## Technique Routing Table

| Category | Recipes | Key Functions | Uniforms |
|----------|---------|---------------|----------|
| **2D SDF** | circle, box, roundedBox, line, segment, triangle, hexagon, capsule | `sdCircle`, `sdBox`, `sdSegment`, `sdTriangle`, `sdHexagon`, `sdCapsule` | `iTime`, `iResolution`, `iMouse` |
| **Color palettes** | cosinePalette (4-param), HSV, gradientMix | `cosinePalette`, `hsv2rgb`, `gradientMix` | `iTime`, `iResolution` |
| **Procedural noise** | valueNoise, perlinNoise, simplexNoise, fbm (≤6 octaves) | `valueNoise`, `perlinNoise`, `simplexNoise`, `fbm` | `iTime`, `iResolution` |
| **UV transforms** | scale, rotate, polarCoords, kaleidoscope, tileRepeat | `scaleUV`, `rotateUV`, `polarUV`, `kaleidoscopeUV`, `tileUV` | `iTime`, `iResolution`, `iMouse` |
| **Post-processing** | vignette, chromaticAberration, grain, acesToneMapping | `vignette`, `chromaticAberration`, `grain`, `acesToneMapping` | `iTime`, `iResolution`, `iMouse` |
| **Raymarching (basic)** | singleSDFPrimitive, estimateNormal, phongLighting, softShadows | `map`, `raymarch`, `calcNormal`, `phong`, `softShadow` | `iTime`, `iResolution`, `iMouse` |

### Recipe Selection Rules

1. **Default to simplest recipe that satisfies the request.** A "circle" request gets `sdCircle`, not a full scene.
2. **Combine recipes only within the same category.** Do not mix raymarching with 2D SDF in the same shader (v1 limitation).
3. **FBM octaves ≤ 6.** Hard limit. If user asks for more, use 6 and note the cap.
4. **Raymarch steps ≤ 128.** Hard limit. If the scene needs more, simplify the SDF instead.

## Recipe Templates (Inline)

### 2D SDF — Circle
```glsl
float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float d = sdCircle(uv, {{RADIUS}});
    vec3 col = vec3(1.0) - sign(d) * vec3(0.1, 0.4, 0.8);
    col *= 1.0 - exp(-2.0 * abs(d));
    col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, 0.02, abs(d)));
    fragColor = vec4(col, 1.0);
}
```

### Color Palettes — Cosine Palette
```glsl
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = {{TIME_SCALE}} * iTime + uv.x;
    vec3 col = cosinePalette(t, {{A}}, {{B}}, {{C}}, {{D}});
    fragColor = vec4(col, 1.0);
}
```

### Procedural Noise — FBM
```glsl
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < octaves; i++) {
        v += a * valueNoise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float n = fbm(uv * float({{SCALE}}), {{OCTAVES}});
    fragColor = vec4(vec3(n), 1.0);
}
```

### UV Transforms — Kaleidoscope
```glsl
vec2 kaleidoscopeUV(vec2 uv, int segments) {
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float segAngle = 6.28318 / float(segments);
    a = mod(a, segAngle);
    a = abs(a - segAngle * 0.5);
    return vec2(cos(a), sin(a)) * r + 0.5;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = kaleidoscopeUV(uv, {{SEGMENTS}});
    // Apply base pattern (e.g., simple gradient or SDF)
    vec3 col = vec3(uv, 0.5);
    fragColor = vec4(col, 1.0);
}
```

### Post-Processing — Vignette
```glsl
float vignette(vec2 uv, float intensity, float smoothness) {
    vec2 v = uv * (1.0 - uv.xy);
    float vig = v.x * v.y * 15.0;
    return pow(vig, smoothness) * intensity + (1.0 - intensity);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    // Base scene (placeholder — can be replaced with actual scene)
    vec3 col = vec3(uv, 0.5 + 0.5 * sin(iTime));
    float vig = vignette(uv, {{INTENSITY}}, {{SMOOTHNESS}});
    col *= vig;
    fragColor = vec4(col, 1.0);
}
```

### Raymarching (Basic) — Single SDF Primitive
```glsl
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float map(vec3 p) {
    return sdSphere(p - vec3(0.0, 0.0, float({{Z_OFFSET}})), float({{RADIUS}}));
}

float raymarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    for (int i = 0; i < {{MAX_STEPS}}; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p);
        dO += dS;
        if (dS < float({{SURF_DIST}}) || dO > float({{MAX_DIST}})) break;
    }
    return dO;
}

vec3 calcNormal(vec3 p) {
    float d = map(p);
    vec2 e = vec2(0.001, 0.0);
    vec3 n = d - vec3(map(p - e.xyy), map(p - e.yxy), map(p - e.yyx));
    return normalize(n);
}

vec3 phong(vec3 p, vec3 n, vec3 ro) {
    vec3 light = vec3(1.0, 1.0, 1.0);
    vec3 l = normalize(light - p);
    float diff = max(dot(n, l), 0.0);
    vec3 v = normalize(ro - p);
    vec3 r = reflect(-l, n);
    float spec = pow(max(dot(v, r), 0.0), float({{SHININESS}}));
    return vec3(0.1) + vec3(0.7) * diff + vec3(0.3) * spec;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, float({{CAM_Z}}));
    vec3 rd = normalize(vec3(uv, -float({{FOV}})));
    float d = raymarch(ro, rd);
    vec3 col = vec3(0.0);
    if (d < float({{MAX_DIST}})) {
        vec3 p = ro + rd * d;
        vec3 n = calcNormal(p);
        col = phong(p, n, ro);
    }
    fragColor = vec4(col, 1.0);
}
```

## Compile-First Verification

**Rule:** Never deliver a shader without running compile-verify.

### Verification Script (conceptual — adapt to available tools)

```javascript
// Pseudo-code for verification harness
const fs = require('fs');
const { chromium } = require('playwright');

async function verifyShader(htmlPath) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    
    await page.goto('file://' + htmlPath);
    await page.waitForTimeout(500); // Let shader compile and render
    
    // Check console errors
    const logs = await page.evaluate(() => {
        return window.glErrors || [];
    });
    
    // Check non-black frame
    const screenshot = await page.screenshot({ type: 'png' });
    const variance = computePixelVariance(screenshot); // implement or approximate
    
    await browser.close();
    
    return {
        compileOk: logs.length === 0,
        renderOk: variance > 0.01,
        logs: logs
    };
}
```

### Success Criteria
1. **Compile:** Zero GLSL compile/link errors
2. **Render:** Canvas shows non-black pixels (variance > 0.01)
3. **Technique:** Output is recognizably from the requested family
4. **Performance:** No warnings about loop count or recursion

### Failure Handling
- **Compile error:** Log error, fix in shader body only (harness is fixed), retry
- **Black screen:** Check that `fragColor` is written; verify coordinate math; visualize intermediate values
- **JS error:** Harness bug — check uniform bindings and context creation
- **After 2 retries:** Switch to shader-debug mode. Explain likely cause, provide diagnostic suggestions, do NOT write more code.

## Scope Refusal

**Refuse these requests clearly and concisely:**

| Request | Response |
|---------|----------|
| "Make something cool" | "Please specify a technique family (e.g., 2D SDF circle, FBM noise, vignette post-processing)." |
| WebGPU / Vulkan / Metal | "This skill supports WebGL2 only. For WebGPU, use a different workflow." |
| Multipass / fluid sim | "Out of scope for v1. Raymarching is limited to single-primitive scenes." |
| Path tracing / GI | "Out of scope. Basic raymarching with Phong lighting only." |
| Audio shaders / compute | "Out of scope. Fragment shaders only." |
| Three.js / Unity / R3F integration | "This skill generates standalone .html files. For engine integration, extract the fragment shader and adapt uniforms manually." |
| >6 FBM octaves | "Hard limit is 6 octaves. Using 6." |
| >128 raymarch steps | "Hard limit is 128 steps. Simplify the SDF or accept potential artifacts." |

## Debugging Checklist

See `reference/debugging.md` for full details. Quick reference:

1. **Compile errors:** Check GLSL version (`#version 300 es`), function declaration order, no recursion
2. **Blank screen:** Verify `mainImage` writes to `fragColor`; check `gl_FragCoord` vs `fragCoord` naming
3. **Black screen with no errors:** Check that coordinate math produces visible values; try visualizing `d` or `uv` directly. In raymarching, verify `rd.z` is **negative** (camera looks toward the scene, not away from it). A `+z` ray direction will compile but render black.
4. **Uniform errors:** Ensure all declared uniforms exist in the harness `uniformBlock`
5. **Performance warnings:** Reduce loop counts, simplify SDFs, lower texture lookups
6. **Z-fighting / artifacts in raymarching:** Increase surface distance threshold or reduce step count

## Output Format

When delivering results, provide:

1. **Technique family used** (from routing table)
2. **Parameters applied** (user-specified + defaults)
3. **Verification status** (compile OK / render OK / any warnings)
4. **The output file path** or inline code block

If the user wants raw fragment shader code (not an .html file), omit the harness and provide:
- Fragment shader `mainImage` function
- List of required uniforms and their types
- Note: "Integrate with your own WebGL2 bootstrap."
