import * as THREE from 'three';
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

/**
 * Material Pipeline - Proofer
 * Material pipeline with mask-driven finish effects for print-accurate proofer
 * All methods are static for decoupled usage
 */
export class MaterialPipeline {
  /**
   * Create a card material with mask-driven finish effects
   * 
   * @param options - Texture options including artwork and finish masks
   * @returns THREE.ShaderMaterial configured with mask-driven shader
   */
  static createCardMaterial(options: {
    artworkFrontMap?: THREE.Texture;
    artworkBackMap?: THREE.Texture;
    frontArtwork?: THREE.Texture;
    backArtwork?: THREE.Texture;
    artwork?: THREE.Texture; // Deprecated: use frontArtwork/backArtwork
    foilMaskFront?: THREE.Texture;
    uvMaskFront?: THREE.Texture;
    embossMaskFront?: THREE.Texture;
    dieCutMaskFront?: THREE.Texture;
    foilMaskBack?: THREE.Texture;
    uvMaskBack?: THREE.Texture;
    embossMaskBack?: THREE.Texture;
    dieCutMaskBack?: THREE.Texture;
    foilMask?: THREE.Texture;
    uvMask?: THREE.Texture;
    embossMask?: THREE.Texture;
    dieCutMask?: THREE.Texture;
  }): THREE.ShaderMaterial {
    // Create placeholder artwork textures if not provided
    const defaultArtwork = MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.8, 0.8, 0.9));
    const frontArtwork = options.artworkFrontMap || options.frontArtwork || options.artwork || defaultArtwork;
    const backArtwork = options.artworkBackMap || options.backArtwork || options.artwork || defaultArtwork;
    
    // DEBUG: Verify textures are distinct
    console.log('[MaterialPipeline] Texture UUIDs:', {
      front: frontArtwork?.uuid,
      back: backArtwork?.uuid,
      same: frontArtwork?.uuid === backArtwork?.uuid
    });
    
    // Create placeholder masks (black = no effect) if not provided
    const maskPlaceholder = MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0), THREE.NoColorSpace);
    const foilMask = options.foilMaskFront || options.foilMask || maskPlaceholder;
    const uvMask = options.uvMaskFront || options.uvMask || maskPlaceholder;
    const embossMask = options.embossMaskFront || options.embossMask || maskPlaceholder;
    const dieCutMask = options.dieCutMaskFront || options.dieCutMask || maskPlaceholder;

    // Create shader material
    // Note: Three.js automatically maps geometry attributes to shader attributes when names match
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // Base artwork textures - separate for front and back
        frontArtworkMap: { value: frontArtwork },
        backArtworkMap: { value: backArtwork },

        // Base color tint (for stock preview)
        uBaseColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
        
        // Edge color (for card edges)
        uEdgeColor: { value: new THREE.Color(1.0, 1.0, 1.0) },

        // Finish mask textures
        foilMask: { value: foilMask },
        uvMask: { value: uvMask },
        embossMask: { value: embossMask },
        dieCutMask: { value: dieCutMask },
        
        // UV transforms for cropped masks (offset and scale in card UV space)
        // offset = (rectPx.x0 / cardWidthPx, rectPx.y0 / cardHeightPx)
        // scale = (sizePx.w / cardWidthPx, sizePx.h / cardHeightPx)
        foilUvOffset: { value: new THREE.Vector2(0.0, 0.0) },
        foilUvScale: { value: new THREE.Vector2(1.0, 1.0) },
        uvUvOffset: { value: new THREE.Vector2(0.0, 0.0) },
        uvUvScale: { value: new THREE.Vector2(1.0, 1.0) },
        embossUvOffset: { value: new THREE.Vector2(0.0, 0.0) },
        embossUvScale: { value: new THREE.Vector2(1.0, 1.0) },
        dieCutUvOffset: { value: new THREE.Vector2(0.0, 0.0) },
        dieCutUvScale: { value: new THREE.Vector2(1.0, 1.0) },

        // Finish toggles (boolean flags)
        foilEnabled: { value: false },
        uvEnabled: { value: false },
        embossEnabled: { value: false },
        embossStrength: { value: 0.12 },
        embossMode: { value: 1.0 }, // +1.0 for emboss (raised), -1.0 for deboss (indented)
        dieCutEnabled: { value: false },
        
        // Debug flags (dev-only)
        showFaceId: { value: false },
        showPrintOnly: { value: false },
        showFoilOnly: { value: false },

        // Lighting uniforms
        uLightDirection: { value: new THREE.Vector3(0, 0, 1) },
        uLightColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uAmbientColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
        
        // Camera position for view-dependent effects
        uCameraPosition: { value: new THREE.Vector3(0, 0, 150) }
      },
      side: THREE.DoubleSide
    });

    return material;
  }

  /**
   * Create a placeholder texture
   */
  static createPlaceholderTexture(
    width: number = 512,
    height: number = 512,
    color: THREE.Color = new THREE.Color(0.5, 0.5, 0.5)
  ): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
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
    material.uniforms.uBaseColor.value = threeColor;
  }

  /**
   * Update edge color (applied to card edges)
   */
  static updateEdgeColor(
    material: THREE.ShaderMaterial,
    color: THREE.Color | string
  ): void {
    const threeColor = color instanceof THREE.Color 
      ? color 
      : new THREE.Color(color);
    if (material.uniforms.uEdgeColor) {
      material.uniforms.uEdgeColor.value = threeColor;
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

  static updateDebugFlags(
    material: THREE.ShaderMaterial,
    flags: { showFaceId?: boolean; showPrintOnly?: boolean; showFoilOnly?: boolean }
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
  }

  /**
   * Update UV transform for foil mask (for cropped textures)
   */
  static updateFoilUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    if (material.uniforms.foilUvOffset) {
      material.uniforms.foilUvOffset.value.copy(offset);
    }
    if (material.uniforms.foilUvScale) {
      material.uniforms.foilUvScale.value.copy(scale);
    }
    material.needsUpdate = true;
  }

  /**
   * Update UV transform for UV mask (for cropped textures)
   */
  static updateUvUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    if (material.uniforms.uvUvOffset) {
      material.uniforms.uvUvOffset.value.copy(offset);
    }
    if (material.uniforms.uvUvScale) {
      material.uniforms.uvUvScale.value.copy(scale);
    }
    material.needsUpdate = true;
  }

  /**
   * Update UV transform for emboss mask (for cropped textures)
   */
  static updateEmbossUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    if (material.uniforms.embossUvOffset) {
      material.uniforms.embossUvOffset.value.copy(offset);
    }
    if (material.uniforms.embossUvScale) {
      material.uniforms.embossUvScale.value.copy(scale);
    }
    material.needsUpdate = true;
  }

  /**
   * Update UV transform for die-cut mask (for cropped textures)
   */
  static updateDieCutUvTransform(
    material: THREE.ShaderMaterial,
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    if (material.uniforms.dieCutUvOffset) {
      material.uniforms.dieCutUvOffset.value.copy(offset);
    }
    if (material.uniforms.dieCutUvScale) {
      material.uniforms.dieCutUvScale.value.copy(scale);
    }
    material.needsUpdate = true;
  }
}

