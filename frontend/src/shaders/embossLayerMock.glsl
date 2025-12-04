// Emboss Layer Mock Shader
// Placeholder height-based normal perturbation for emboss simulation

uniform sampler2D embossHeightMap;
uniform float embossIntensity;
uniform bool embossEnabled;

// Placeholder normal perturbation from height map
vec3 applyEmbossLayer(vec3 baseNormal, vec2 uv) {
  if (!embossEnabled) {
    return baseNormal;
  }
  
  float height = texture2D(embossHeightMap, uv).r;
  if (height < 0.01) {
    return baseNormal;
  }
  
  // Simple normal perturbation using height gradient
  // This is a placeholder - proper implementation would use proper normal mapping
  vec2 texelSize = vec2(1.0 / 512.0); // Assuming 512x512 texture
  
  float heightL = texture2D(embossHeightMap, uv - vec2(texelSize.x, 0.0)).r;
  float heightR = texture2D(embossHeightMap, uv + vec2(texelSize.x, 0.0)).r;
  float heightD = texture2D(embossHeightMap, uv - vec2(0.0, texelSize.y)).r;
  float heightU = texture2D(embossHeightMap, uv + vec2(0.0, texelSize.y)).r;
  
  vec3 dx = vec3(1.0, 0.0, (heightR - heightL) * embossIntensity);
  vec3 dy = vec3(0.0, 1.0, (heightU - heightD) * embossIntensity);
  
  vec3 perturbedNormal = normalize(cross(dx, dy));
  
  // Blend with base normal
  return normalize(mix(baseNormal, perturbedNormal, height * embossIntensity * 0.5));
}

