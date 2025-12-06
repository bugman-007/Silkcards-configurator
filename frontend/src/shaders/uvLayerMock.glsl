// UV Gloss Layer Mock Shader
// Placeholder clearcoat/gloss for UV varnish simulation

vec3 applyUVLayer(vec3 baseColor, vec2 uv, sampler2D mask, float gloss) {
    float m = texture2D(mask, uv).r;
    if (m < 0.01) {
        return baseColor;
    }
    
    // Placeholder clearcoat color (slight blue tint for UV)
    vec3 clearcoatColor = vec3(0.95, 0.97, 1.0);
    
    // Apply clearcoat with gloss factor
    float clearcoatFactor = m * gloss * 0.3;
    return mix(baseColor, clearcoatColor, clearcoatFactor);
}
