// Emboss Layer Mock Shader
// Placeholder height-based effect for emboss simulation

vec3 applyEmbossLayer(vec3 baseColor, vec2 uv, sampler2D embossMap, float strength) {
    float height = texture2D(embossMap, uv).r;
    if (height < 0.01) {
        return baseColor;
    }
    
    // Placeholder emboss effect - darken/lighten based on height
    float embossFactor = (height - 0.5) * strength;
    
    // Apply emboss effect (simple brightness adjustment)
    vec3 embossed = baseColor + vec3(embossFactor * 0.3);
    
    return clamp(embossed, 0.0, 1.0);
}
