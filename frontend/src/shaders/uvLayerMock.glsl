// UV Gloss Layer Mock Shader
// Placeholder clearcoat/gloss for UV varnish simulation

uniform sampler2D uvMask;
uniform float uvGlossiness;
uniform bool uvEnabled;

// Placeholder clearcoat effect
vec3 applyUVLayer(vec3 baseColor, vec2 uv, vec3 normal, vec3 viewDir, vec3 lightDir) {
  if (!uvEnabled) {
    return baseColor;
  }
  
  float mask = texture2D(uvMask, uv).r;
  if (mask < 0.01) {
    return baseColor;
  }
  
  // Placeholder clearcoat fresnel
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
  
  // Glossy reflection
  vec3 reflectDir = reflect(-viewDir, normal);
  float specular = pow(max(dot(lightDir, reflectDir), 0.0), 64.0);
  
  // Clearcoat color (slight blue tint for UV)
  vec3 clearcoatColor = vec3(0.95, 0.97, 1.0);
  
  // Apply clearcoat with fresnel
  float clearcoatFactor = mask * uvGlossiness * (0.1 + fresnel * 0.9);
  vec3 clearcoat = mix(baseColor, clearcoatColor, clearcoatFactor * 0.3);
  
  // Add specular highlight
  clearcoat += vec3(1.0) * specular * mask * uvGlossiness * 0.5;
  
  return clearcoat;
}

