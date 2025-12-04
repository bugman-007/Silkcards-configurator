// Complete Fragment Shader
// Combines all layer modules for print-accurate rendering

precision highp float;

// Base material varyings
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

// Base artwork texture
uniform sampler2D artworkTexture;

// Lighting
uniform vec3 lightDirection;
uniform vec3 cameraPosition;

// Include all layer modules
#include layerBlend.glsl
#include foilLayerMock.glsl
#include uvLayerMock.glsl
#include embossLayerMock.glsl

void main() {
  // Base color from artwork
  vec3 baseColor = texture2D(artworkTexture, vUv).rgb;
  
  // Calculate view and light directions
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 lightDir = normalize(lightDirection);
  
  // Apply emboss layer (affects normal)
  vec3 finalNormal = applyEmbossLayer(vNormal, vUv);
  
  // Apply foil layer
  vec3 color = applyFoilLayer(baseColor, vUv, finalNormal, viewDir, lightDir);
  
  // Apply UV layer
  color = applyUVLayer(color, vUv, finalNormal, viewDir, lightDir);
  
  // Basic lighting (simple diffuse)
  float NdotL = max(dot(finalNormal, lightDir), 0.0);
  color *= 0.5 + 0.5 * NdotL; // Ambient + diffuse
  
  // Output
  gl_FragColor = vec4(color, 1.0);
}

