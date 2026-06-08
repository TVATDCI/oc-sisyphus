# Shader Debugging Checklist

## Compile Errors

### GLSL Version Mismatch
- **Symptom:** `ERROR: 0:1: '' : syntax error`
- **Cause:** Missing or wrong `#version` directive
- **Fix:** Always use `#version 300 es` for WebGL2. Place it on the very first line.

### Function Declaration Order
- **Symptom:** `ERROR: 0:X: 'foo' : no matching overloaded function found`
- **Cause:** Function called before declared (GLSL ES 3.0 requires forward declaration or definition-before-use)
- **Fix:** Move helper function definitions above `mainImage()`, or add a forward declaration.

### Macro / Preprocessor Limits
- **Symptom:** `ERROR: 0:X: '' : macro expansion exhausted`
- **Cause:** Recursive macro or overly complex `#define`
- **Fix:** Simplify macros; use functions instead of recursive macros.

### Precision Qualifier Missing
- **Symptom:** `ERROR: 0:X: No precision specified for (float)`
- **Cause:** Fragment shader lacks `precision highp float;`
- **Fix:** Add `precision highp float;` at the top of the fragment shader.

## Blank / Black Screen

### `fragColor` Not Written
- **Symptom:** Canvas is transparent or black, no compile errors
- **Check:** Ensure `mainImage` assigns to `fragColor`
- **Fix:** Add `fragColor = vec4(col, 1.0);` at the end of `mainImage`

### Coordinate Space Confusion
- **Symptom:** Shader compiles but shows solid color or nothing
- **Check:** Verify UV math produces values in [0,1] or visible range
- **Fix:** Debug by outputting `fragColor = vec4(uv, 0.0, 1.0);` to visualize coordinates

### Division by Zero / NaN
- **Symptom:** Pixels are black or corrupted
- **Check:** Look for divisions by `length(p)` when `p` is zero, or `log(0)`
- **Fix:** Add epsilon: `length(p) + 0.0001`

## Visual Artifacts

### Z-Fighting (Raymarching)
- **Symptom:** Flickering stripes on surfaces
- **Cause:** Surface threshold too small or step count too high
- **Fix:** Increase `SURF_DIST` (e.g., 0.001 → 0.005) or reduce `MAX_STEPS`

### Banding / Quantization
- **Symptom:** Visible color bands in gradients
- **Cause:** Insufficient precision or no dithering
- **Fix:** Add subtle noise: `col += (hash(uv) - 0.5) * 0.01;`

### Moiré Patterns
- **Symptom:** Wavy interference patterns
- **Cause:** High-frequency sampling without anti-aliasing
- **Fix:** Use smoothstep for edges; add small jitter to UVs

## Performance Issues

### Frame Rate Drop
- **Symptom:** Browser tab lags or freezes
- **Check:** Look for unbounded loops, excessive raymarch steps, or complex nested noise
- **Fix:**
  - Cap loops: raymarch ≤ 128 steps, FBM ≤ 6 octaves, total loop iterations per pixel ≤ 1000
  - Simplify SDFs: use cheaper approximations
  - Reduce resolution for preview: render at 0.5x and scale with CSS

### Shader Compilation Timeout
- **Symptom:** Browser hangs during page load
- **Cause:** Extremely long shader source or complex loop unrolling
- **Fix:** Break shader into smaller functions; reduce loop bounds so compiler can unroll safely

## Uniform / API Errors

### Uniform Not Found
- **Symptom:** `WebGL: INVALID_VALUE: uniform1f: location not for current program`
- **Cause:** Uniform declared in shader but not in harness, or typo in name
- **Fix:** Ensure harness `uniforms` object contains every uniform declared in the shader

### Wrong Uniform Type
- **Symptom:** `WebGL: INVALID_OPERATION: uniform1f: location is not for float`
- **Cause:** Type mismatch between JS `gl.uniform*` call and GLSL declaration
- **Fix:** Match JS call to GLSL type: `float` → `uniform1f`, `vec2` → `uniform2f`, `int` → `uniform1i`

### Context Lost
- **Symptom:** `WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost`
- **Cause:** GPU memory exhausted or tab backgrounded
- **Fix:** Listen for `webglcontextlost` event; reduce texture memory usage

## Debugging Techniques

### Visualize Normals
```glsl
// In raymarching, replace lighting with:
vec3 n = calcNormal(p);
fragColor = vec4(n * 0.5 + 0.5, 1.0);
```

### Visualize Step Count
```glsl
// Color by iteration count:
float t = float(i) / float(MAX_STEPS);
fragColor = vec4(vec3(t), 1.0);
```

### Visualize Depth
```glsl
// In raymarching, after hit:
float t = d / MAX_DIST;
fragColor = vec4(vec3(t), 1.0);
```

### Check UV Space
```glsl
// Output raw UVs:
fragColor = vec4(fract(uv), 0.0, 1.0);
```

## Performance Budget (Hard Limits)

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Raymarch steps | ≤ 128 | GPU loop limit, prevents timeout |
| FBM octaves | ≤ 6 | Diminishing returns, exponential cost |
| Loop iterations / pixel | ≤ 1000 | Sum of all nested loops |
| Shader source length | ≤ 50KB | Compilation time |
| Uniforms | ≤ 16 | Portable across devices |

## Error Log Location

Compile and link errors are captured in:
```javascript
window.glErrors // Array of {type, message} objects
```

Check this array after loading the page to diagnose shader issues programmatically.
