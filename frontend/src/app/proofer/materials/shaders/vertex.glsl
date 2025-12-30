precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// DEV: explode view spacing (world units, same unit as geometry: mm if geometry is mm)
uniform float uDevLayerSpacing;
// Face identifier (0.0 = front, 1.0 = back) - set per material
uniform float uIsFront;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    // DEV: explode front/back caps for debugging (sides/walls use a different material)
    vec3 pos = position;
    if (uDevLayerSpacing != 0.0) {
        if (uIsFront > 0.5) {
            pos.z += uDevLayerSpacing;   // front outwards
        } else {
            pos.z -= uDevLayerSpacing;   // back outwards
        }
    }
    
    // Calculate world position for lighting calculations
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
