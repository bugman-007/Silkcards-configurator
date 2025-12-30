import * as THREE from 'three';
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

/**
 * Material Pipeline - Proofer
 * Simplified per-face material pipeline
 * Each material is for a specific face (front or back) of a specific ply
 */
export class MaterialPipeline {
  /**
   * Create a card material for a specific face (front or back)
   * No face detection needed - material is face-specific
   * 
   * @param options - Texture options including print and finish masks
   * @returns THREE.ShaderMaterial configured for the specified face
   */
  static createCardMaterial(options: {
    isFront: boolean; // true for front face, false for back face
    printMap?: THREE.Texture; // PRINT composite for this face
    foilMask?: THREE.Texture; // FOIL mask for this face
    uvMask?: THREE.Texture; // UV mask for this face
    embossMask?: THREE.Texture; // EMBOSS mask for this face
    diecutMask?: THREE.Texture; // DIECUT mask (shared or per-face)
  }): THREE.ShaderMaterial {
    // Create placeholder textures if not provided
    const defaultPrint = MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(1.0, 1.0, 1.0));
    const maskPlaceholder = MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0), THREE.NoColorSpace);
    maskPlaceholder.generateMipmaps = false;
    maskPlaceholder.minFilter = THREE.LinearFilter;
    maskPlaceholder.magFilter = THREE.LinearFilter;

    const printMap = options.printMap || defaultPrint;
    const foilMask = options.foilMask || maskPlaceholder;
    const uvMask = options.uvMask || maskPlaceholder;
    const embossMask = options.embossMask || maskPlaceholder;
    const diecutMask = options.diecutMask || maskPlaceholder;

    // Create shader material
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // Print texture for this face
        uPrintMap: { value: printMap },

        // Finish mask textures (per-face)
        uFoilMask: { value: foilMask },
        uUvMask: { value: uvMask },
        uEmbossMask: { value: embossMask },
        uDiecutMask: { value: diecutMask },

        // Face identifier (0.0 = front, 1.0 = back)
        uIsFront: { value: options.isFront ? 1.0 : 0.0 },

        // Base color tint (for stock preview)
        uBaseColor: { value: new THREE.Color(1.0, 1.0, 1.0) },

        // Finish toggles (boolean flags)
        foilEnabled: { value: false },
        uvEnabled: { value: false },
        // Spot UV tuning
        uUvBoost: { value: 1.35 },        // increase if you want shinier
        uUvSpecPower: { value: 32.0 },    // lower = wider highlight area (Spot-UV visible over larger area)
        embossEnabled: { value: false },
        embossStrength: { value: 0.12 },
        embossMode: { value: 1.0 }, // +1.0 for emboss (raised), -1.0 for deboss (indented)
        // Emboss tuning: without a highlight term emboss looks flat
        uEmbossSpecBoost: { value: 0.9 },   // 0.6–1.4 typical
        uEmbossSpecPower: { value: 72.0 },  // 48–120 typical (higher = tighter highlight)
        dieCutEnabled: { value: false },
        
        // Debug flags (dev-only)
        showFaceId: { value: false },
        showPrintOnly: { value: false },
        showFoilOnly: { value: false },
        showMaskOnly: { value: false }, // New: show mask visualizations

        // DEV: layer explode spacing (0 = off, spacing is in world units: mm if geometry uses mm)
        uDevLayerSpacing: { value: 0.0 },

        // Lighting uniforms
        uLightDirection: { value: new THREE.Vector3(0, 0, 1) },
        uLightColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uAmbientColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
        
        // Camera position for view-dependent effects
        uCameraPosition: { value: new THREE.Vector3(0, 0, 150) }
      },
      // Use FrontSide for each face material (not DoubleSide which causes mirrored backs)
      // Back face geometry has its own material with correct UVs
      side: THREE.FrontSide
    });

    return material;
  }

  static createEdgeStandardMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.95, 0.95, 0.93),
      roughness: 0.85,
      metalness: 0.0,
    });
  }

  /**
   * Create a PBR edge material for ply side faces (paper edge look)
   * @param edgeColor - Color for the edge (default: off-white paper color)
   * @returns A MeshStandardMaterial with proper roughness/metalness for paper edges
   */
  static createEdgeMaterial(edgeColor: THREE.Color = new THREE.Color(0.95, 0.95, 0.93)): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: edgeColor,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.FrontSide
    });
  }

  /**
   * Create a placeholder texture
   */
  static createPlaceholderTexture(
    width: number = 512,
    height: number = 512,
    color: THREE.Color = new THREE.Color(0.5, 0.5, 0.5),
    colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
  ): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = colorSpace;
    return texture;
  }

  /**
   * Update print texture for this face
   */
  static updatePrintMap(
    material: THREE.ShaderMaterial,
    texture: THREE.Texture
  ): void {
    if (material.uniforms.uPrintMap) {
      material.uniforms.uPrintMap.value = texture;
      texture.needsUpdate = true;
      material.needsUpdate = true;
    }
  }

  /**
   * Update foil mask texture
   */
  static updateFoilMask(
    material: THREE.ShaderMaterial,
    texture: THREE.Texture
  ): void {
    if (material.uniforms.uFoilMask) {
      material.uniforms.uFoilMask.value = texture;
      texture.needsUpdate = true;
      material.needsUpdate = true;
    }
  }

  /**
   * Update UV mask texture
   */
  static updateUvMask(
    material: THREE.ShaderMaterial,
    texture: THREE.Texture
  ): void {
    if (material.uniforms.uUvMask) {
      material.uniforms.uUvMask.value = texture;
      texture.needsUpdate = true;
      material.needsUpdate = true;
    }
  }

  /**
   * Update emboss mask texture
   */
  static updateEmbossMask(
    material: THREE.ShaderMaterial,
    texture: THREE.Texture
  ): void {
    if (material.uniforms.uEmbossMask) {
      material.uniforms.uEmbossMask.value = texture;
      texture.needsUpdate = true;
      material.needsUpdate = true;
    }
  }

  /**
   * Update diecut mask texture
   */
  static updateDiecutMask(
    material: THREE.ShaderMaterial,
    texture: THREE.Texture
  ): void {
    if (material.uniforms.uDiecutMask) {
      material.uniforms.uDiecutMask.value = texture;
      texture.needsUpdate = true;
      material.needsUpdate = true;
    }
  }

  /**
   * Update base color (tint applied to artwork)
   */
  static updateBaseColor(
    material: THREE.ShaderMaterial,
    color: THREE.Color | string
  ): void {
    const threeColor = color instanceof THREE.Color 
      ? color 
      : new THREE.Color(color);
    if (material.uniforms.uBaseColor) {
      material.uniforms.uBaseColor.value = threeColor;
    }
  }

  /**
   * Update lighting uniforms from scene lighting information
   */
  static updateLighting(
    material: THREE.ShaderMaterial,
    lightingInfo: {
      direction: THREE.Vector3;
      color: THREE.Color;
      ambient: THREE.Color;
      cameraPosition?: THREE.Vector3;
    }
  ): void {
    if (material.uniforms.uLightDirection) {
      material.uniforms.uLightDirection.value.copy(lightingInfo.direction);
    }
    if (material.uniforms.uLightColor) {
      material.uniforms.uLightColor.value.copy(lightingInfo.color);
    }
    if (material.uniforms.uAmbientColor) {
      material.uniforms.uAmbientColor.value.copy(lightingInfo.ambient);
    }
    if (material.uniforms.uCameraPosition && lightingInfo.cameraPosition) {
      material.uniforms.uCameraPosition.value.copy(lightingInfo.cameraPosition);
    }
  }

  /**
   * Update foil effect (mask-driven)
   */
  static updateFoil(
    material: THREE.ShaderMaterial,
    enabled: boolean
  ): void {
    if (material.uniforms.foilEnabled) {
      material.uniforms.foilEnabled.value = enabled;
    }
  }

  /**
   * Update UV gloss effect (mask-driven)
   */
  static updateUV(
    material: THREE.ShaderMaterial,
    enabled: boolean
  ): void {
    if (material.uniforms.uvEnabled) {
      material.uniforms.uvEnabled.value = enabled;
    }
  }

  /**
   * Update emboss effect (mask-driven)
   */
  static updateEmboss(
    material: THREE.ShaderMaterial,
    enabled: boolean
  ): void {
    if (material.uniforms.embossEnabled) {
      material.uniforms.embossEnabled.value = enabled;
    }
  }

  /**
   * Update emboss parameters (strength and mode)
   */
  static updateEmbossParams(
    material: THREE.ShaderMaterial,
    enabled: boolean,
    strength: number,
    mode: number
  ): void {
    if (material.uniforms.embossEnabled) {
      material.uniforms.embossEnabled.value = enabled;
    }
    if (material.uniforms.embossStrength) {
      material.uniforms.embossStrength.value = strength;
    }
    if (material.uniforms.embossMode) {
      material.uniforms.embossMode.value = mode;
    }
    material.needsUpdate = true;
  }

  /**
   * Update die-cut effect (mask-driven fragment discard)
   */
  static updateDieCut(
    material: THREE.ShaderMaterial,
    enabled: boolean
  ): void {
    if (material.uniforms.dieCutEnabled) {
      material.uniforms.dieCutEnabled.value = enabled;
    }
    material.needsUpdate = true;
  }

  /**
   * Update debug flags
   */
  static updateDebugFlags(
    material: THREE.ShaderMaterial,
    flags: { 
      showFaceId?: boolean; 
      showPrintOnly?: boolean; 
      showFoilOnly?: boolean;
      showMaskOnly?: boolean;
    }
  ): void {
    if (material.uniforms.showFaceId && typeof flags.showFaceId === 'boolean') {
      material.uniforms.showFaceId.value = flags.showFaceId;
    }
    if (material.uniforms.showPrintOnly && typeof flags.showPrintOnly === 'boolean') {
      material.uniforms.showPrintOnly.value = flags.showPrintOnly;
    }
    if (material.uniforms.showFoilOnly && typeof flags.showFoilOnly === 'boolean') {
      material.uniforms.showFoilOnly.value = flags.showFoilOnly;
    }
    if (material.uniforms.showMaskOnly && typeof flags.showMaskOnly === 'boolean') {
      material.uniforms.showMaskOnly.value = flags.showMaskOnly;
    }
  }

  /**
   * UV Transform methods (legacy compatibility)
   * NOTE: New architecture doesn't need UV transforms - textures are composited at full card size
   * These are stubs for backward compatibility with old EngineBridge code
   */
  static updateFoilUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    // No-op: new architecture doesn't use UV transforms
    console.warn('[MaterialPipeline] updateFoilUvTransform called but not needed in new architecture');
  }

  static updateUvUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    // No-op: new architecture doesn't use UV transforms
    console.warn('[MaterialPipeline] updateUvUvTransform called but not needed in new architecture');
  }

  static updateEmbossUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    // No-op: new architecture doesn't use UV transforms
    console.warn('[MaterialPipeline] updateEmbossUvTransform called but not needed in new architecture');
  }

  static updateDieCutUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    // No-op: new architecture doesn't use UV transforms
    console.warn('[MaterialPipeline] updateDieCutUvTransform called but not needed in new architecture');
  }

  /**
   * DEV: explode spacing between front/back and edge band for debugging
   * spacing is in the same world units as your geometry (mm if geometry uses mm)
   * @param material - The shader material to update
   * @param enabled - Whether dev mode is enabled
   * @param spacing - Spacing amount in world units (default: 25mm = 2.5cm)
   */
  static updateDevLayerSpacing(
    material: THREE.ShaderMaterial,
    enabled: boolean,
    spacing: number = 25.0
  ): void {
    if (!material.uniforms.uDevLayerSpacing) {
      console.warn('[MaterialPipeline] uDevLayerSpacing uniform not found in material');
      return;
    }
    material.uniforms.uDevLayerSpacing.value = enabled ? spacing : 0.0;
    material.needsUpdate = true;
  }
}
