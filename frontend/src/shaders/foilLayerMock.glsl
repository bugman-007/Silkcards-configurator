// Foil Layer Mock Shader
// Placeholder BRDF for metallic foil simulation

vec3 applyFoilLayer(vec3 baseColor, vec2 uv, sampler2D mask) {
    float m = texture2D(mask, uv).r;
    if (m < 0.01) {
        return baseColor;
    }
    
    // Placeholder metallic color (gold/brass)
    vec3 foilColor = vec3(0.8, 0.7, 0.5);
    
    // Blend metallic color with base
    return mix(baseColor, foilColor, m);
}
