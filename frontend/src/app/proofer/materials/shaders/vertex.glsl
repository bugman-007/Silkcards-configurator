precision highp float;

attribute float faceType;
attribute float plyIndex; // Ply index for material selection

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFaceType;
varying float vPlyIndex; // Pass ply index to fragment shader

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vFaceType = faceType;
    vPlyIndex = plyIndex;
    
    // Calculate world position for lighting calculations
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
