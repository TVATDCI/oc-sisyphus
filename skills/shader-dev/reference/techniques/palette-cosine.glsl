// Technique: Color Palette — Cosine Palette
// Parameters:
//   TIME_SCALE (float, default: 0.5)
//   A (vec3, default: vec3(0.5, 0.5, 0.5))
//   B (vec3, default: vec3(0.5, 0.5, 0.5))
//   C (vec3, default: vec3(1.0, 1.0, 1.0))
//   D (vec3, default: vec3(0.0, 0.33, 0.67))

vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = {{TIME_SCALE}} * iTime + uv.x;
    vec3 col = cosinePalette(t, {{A}}, {{B}}, {{C}}, {{D}});
    fragColor = vec4(col, 1.0);
}
