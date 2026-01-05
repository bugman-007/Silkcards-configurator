precision highp float;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

// DEV: layer explode spacing
uniform float uDevLayerSpacing;

// Face identifier (1.0 = front, 0.0 = back) - MaterialPipeline sets this
uniform float uIsFront;

void main() {
  vUv = uv;

  vec3 pos = position;

  // Optional dev explode
  if (uDevLayerSpacing != 0.0) {
    if (uIsFront > 0.5) pos.z += uDevLayerSpacing;
    else pos.z -= uDevLayerSpacing;
  }

  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;

  // Correct world normal even with non-uniform scale
  mat3 normalMatrixWorld = mat3(transpose(inverse(modelMatrix)));
  vWorldNormal = normalize(normalMatrixWorld * normal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
