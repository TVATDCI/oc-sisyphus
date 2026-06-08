// Technique: UV Transform — Kaleidoscope
// Parameters:
//   SEGMENTS (int, default: 6)

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
