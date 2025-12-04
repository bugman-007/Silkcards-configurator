// Foil Layer Mock Shader
// Placeholder BRDF for metallic foil simulation

uniform sampler2D foilMask;
uniform float foilIntensity;
uniform bool foilEnabled;

// Placeholder metallic BRDF
vec3 applyFoilLayer(vec3 baseColor, vec2 uv, vec3 normal, vec3 viewDir, vec3 lightDir) {
  if (!foilEnabled) {
    return baseColor;
  }
  
  float mask = texture2D(foilMask, uv).r;
  if (mask < 0.01) {
    return baseColor;
  }
  
  // Placeholder metallic reflection
  vec3 reflectDir = reflect(-lightDir, normal);
  float specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
  
  // Metallic color (gold/brass placeholder)
  vec3 foilColor = vec3(0.8, 0.7, 0.5);
  
  // Blend metallic reflection with base
  vec3 metallic = mix(baseColor, foilColor, mask * foilIntensity);
  vec3 specularHighlight = vec3(1.0) * specular * mask;
  
  return metallic + specularHighlight * 0.3;
}

