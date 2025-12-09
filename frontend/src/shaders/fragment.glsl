precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform sampler2D artworkMap;
uniform sampler2D foilMask;
uniform sampler2D uvMask;
uniform sampler2D embossMap;

uniform vec3 uBaseColor;
uniform float uGloss;
uniform float uEmbossStrength;

// Lighting uniforms
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uCameraPosition;

#include layerBlend.glsl
#include foilLayerMock.glsl
#include uvLayerMock.glsl
#include embossLayerMock.glsl

void main() {
    vec4 baseColor = texture2D(artworkMap, vUv);

    // Apply base color tint (multiply with artwork)
    vec3 color = baseColor.rgb * uBaseColor;

    // Calculate lighting
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(-uLightDirection); // Light direction points toward light
    
    // Diffuse lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = uLightColor * NdotL;
    
    // Ambient lighting
    vec3 ambient = uAmbientColor;
    
    // Combine lighting
    vec3 litColor = color * (ambient + diffuse);
    
    // Apply print layers
    litColor = applyFoilLayer(litColor, vUv, foilMask);
    litColor = applyUVLayer(litColor, vUv, uvMask, uGloss);
    litColor = applyEmbossLayer(litColor, vUv, embossMap, uEmbossStrength);

    gl_FragColor = vec4(litColor, 1.0);
}
