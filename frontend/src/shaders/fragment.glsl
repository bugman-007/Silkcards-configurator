// Complete Fragment Shader
// Combines all layer modules for print-accurate rendering

precision highp float;

// Varyings from vertex shader
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

// Main uniforms
uniform sampler2D uArtworkMap;
uniform sampler2D uFoilMask;
uniform sampler2D uUvMask;
uniform sampler2D uEmbossMap;
uniform vec3 uBaseColor;
uniform float uMetallic;
uniform float uGloss;
uniform float uEmbossStrength;

// Lighting uniforms (will be updated per frame)
uniform vec3 lightDirection;
uniform vec3 cameraPosition;

// Shader module uniforms (aliased to main uniforms)
uniform sampler2D foilMask;
uniform sampler2D uvMask;
uniform sampler2D embossHeightMap;
uniform float foilIntensity;
uniform bool foilEnabled;
uniform float uvGlossiness;
uniform bool uvEnabled;
uniform float embossIntensity;
uniform bool embossEnabled;

// Include all layer modules
#include layerBlend.glsl
#include foilLayerMock.glsl
#include uvLayerMock.glsl
#include embossLayerMock.glsl

void main() {
  // Get base color from artwork or uniform
  vec3 baseColor = texture2D(uArtworkMap, vUv).rgb;
  if (length(baseColor) < 0.01) {
    baseColor = uBaseColor;
  }
  
  // Calculate view and light directions
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 lightDir = normalize(lightDirection);
  
  // Apply emboss layer (affects normal)
  vec3 finalNormal = applyEmbossLayer(vNormal, vUv);
  
  // Apply foil layer (placeholder blending)
  vec3 color = applyFoilLayer(baseColor, vUv, finalNormal, viewDir, lightDir);
  
  // Apply UV layer (placeholder blending)
  color = applyUVLayer(color, vUv, finalNormal, viewDir, lightDir);
  
  // Basic lighting (simple diffuse)
  float NdotL = max(dot(finalNormal, lightDir), 0.0);
  color *= 0.5 + 0.5 * NdotL; // Ambient + diffuse
  
  // Output
  gl_FragColor = vec4(color, 1.0);
}
