precision highp float;

varying vec2 vUv;
varying vec3 vNormal;

uniform sampler2D artworkMap;
uniform sampler2D foilMask;
uniform sampler2D uvMask;
uniform sampler2D embossMap;

uniform float uGloss;
uniform float uEmbossStrength;

#include layerBlend.glsl
#include foilLayerMock.glsl
#include uvLayerMock.glsl
#include embossLayerMock.glsl

void main() {
    vec4 baseColor = texture2D(artworkMap, vUv);

    vec3 color = baseColor.rgb;

    color = applyFoilLayer(color, vUv, foilMask);
    color = applyUVLayer(color, vUv, uvMask, uGloss);
    color = applyEmbossLayer(color, vUv, embossMap, uEmbossStrength);

    gl_FragColor = vec4(color, 1.0);
}
