// Technique: Post-Processing — Vignette
// Parameters:
//   INTENSITY (float, default: 0.8)
//   SMOOTHNESS (float, default: 0.5)

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
