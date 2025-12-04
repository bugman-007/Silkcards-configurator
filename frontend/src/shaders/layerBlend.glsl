// Layer Blending Utilities
// Mask-driven blending functions for multiple print layers

// Blend two colors using a mask
vec3 blendWithMask(vec3 baseColor, vec3 layerColor, float mask) {
  return mix(baseColor, layerColor, mask);
}

// Blend with alpha support
vec3 blendWithAlpha(vec3 baseColor, vec3 layerColor, float mask, float alpha) {
  float blendFactor = mask * alpha;
  return mix(baseColor, layerColor, blendFactor);
}

// Overlay blend mode for print layers
vec3 overlayBlend(vec3 base, vec3 layer, float mask) {
  vec3 result = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    if (base[i] < 0.5) {
      result[i] = 2.0 * base[i] * layer[i];
    } else {
      result[i] = 1.0 - 2.0 * (1.0 - base[i]) * (1.0 - layer[i]);
    }
  }
  return mix(base, result, mask);
}

// Screen blend mode
vec3 screenBlend(vec3 base, vec3 layer, float mask) {
  vec3 result = 1.0 - (1.0 - base) * (1.0 - layer);
  return mix(base, result, mask);
}

