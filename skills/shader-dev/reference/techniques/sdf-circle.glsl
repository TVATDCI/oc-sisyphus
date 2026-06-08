// Technique: 2D SDF — Circle
// Parameters: RADIUS (float, default: 0.3)

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
