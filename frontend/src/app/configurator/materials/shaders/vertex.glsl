precision highp float;

attribute float faceType;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFaceType;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vFaceType = faceType;
    
    // Calculate world position for lighting calculations
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

