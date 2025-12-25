precision highp float;

attribute float faceType;
attribute float plyIndex; // Ply index for material selection

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFaceType;
varying float vPlyIndex; // Pass ply index to fragment shader

// DEV: explode view spacing (world units, same unit as geometry: mm if geometry is mm)
uniform float uDevLayerSpacing;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vFaceType = faceType;
    vPlyIndex = plyIndex;
    
    // DEV: explode front/back away from the edge band for debugging
    vec3 pos = position;
    if (uDevLayerSpacing != 0.0) {
        // faceType: 0=front, 1=back, 2=edge
        if (faceType < 0.5) {
            pos.z += uDevLayerSpacing;   // front outwards
        } else if (faceType < 1.5) {
            pos.z -= uDevLayerSpacing;   // back outwards
        }
        // edge band (faceType >= 1.5) stays put, so gaps appear
    }
    
    // Calculate world position for lighting calculations
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
