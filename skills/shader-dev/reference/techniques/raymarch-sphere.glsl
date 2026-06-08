// Technique: Raymarching (Basic) — Single SDF Primitive with Phong Lighting
// Parameters:
//   Z_OFFSET (float, default: 2.0)
//   RADIUS (float, default: 0.5)
//   MAX_STEPS (int, default: 64, MAX: 128)
//   SURF_DIST (float, default: 0.001)
//   MAX_DIST (float, default: 100.0)
//   CAM_Z (float, default: 3.0)
//   FOV (float, default: 1.0)
//   SHININESS (float, default: 32.0)

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
