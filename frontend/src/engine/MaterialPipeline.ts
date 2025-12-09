import * as THREE from 'three';
// Import shaders without ?raw so vite-plugin-glsl can process #include directives
import vertexShader from '../shaders/vertex.glsl';
import fragmentShader from '../shaders/fragment.glsl';
import type { LayerSide, FoilConfig, UVConfig, EmbossConfig } from '../configurator/ConfigState.js';

/**
 * Material Pipeline
 * Builds and manages shader materials with print layer support
 * All methods are static for decoupled usage
 */
export class MaterialPipeline {
  /**
   * Create a card material with shader pipeline
   * 
   * @param options - Texture options (all optional, will use placeholders if not provided)
   * @returns THREE.ShaderMaterial configured with all shader modules
   */
  static createCardMaterial(options: {
    artwork?: THREE.Texture;
    foilMask?: THREE.Texture;
    uvMask?: THREE.Texture;
    embossMap?: THREE.Texture;
  }): THREE.ShaderMaterial {
    // Create placeholder textures if not provided
    const artwork = options.artwork || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.8, 0.8, 0.9));
    const foilMask = options.foilMask || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.0, 0.0, 0.0));
    const uvMask = options.uvMask || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.0, 0.0, 0.0));
    const embossMap = options.embossMap || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5));

    // Use shader files directly (they include all modules via #include directives)
    // vite-plugin-glsl will handle the #include preprocessing

    // Create shader material
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // Texture uniforms (matching fragment shader uniform names)
        artworkMap: { value: artwork },
        foilMask: { value: foilMask },
        uvMask: { value: uvMask },
        embossMap: { value: embossMap },

        // Material properties
        uBaseColor: { value: new THREE.Color(1.0, 1.0, 1.0) }, // White by default (no tint)
        uGloss: { value: 0.5 },
        uEmbossStrength: { value: 0.5 },

        // Lighting uniforms (will be updated from scene lights)
        uLightDirection: { value: new THREE.Vector3(0, 0, 1) },
        uLightColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
        uAmbientColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
        uCameraPosition: { value: new THREE.Vector3(0, 0, 150) }
      },
      side: THREE.DoubleSide
    });

    // Map shader module uniforms to our uniform names
    // The shader modules use their own uniform names, so we need to alias them
    // We'll update the fragment shader to use the correct uniform names
    // For now, we'll keep the shader modules as-is and map in the update method

    return material;
  }

  /**
   * Update layer textures on an existing material
   * 
   * @param material - The shader material to update
   * @param options - Partial texture options to update
   */
  static updateLayerTextures(
    material: THREE.ShaderMaterial,
    options: Partial<{
      artwork: THREE.Texture;
      foilMask: THREE.Texture;
      uvMask: THREE.Texture;
      embossMap: THREE.Texture;
    }>
  ): void {
    if (options.artwork !== undefined) {
      material.uniforms.artworkMap.value = options.artwork;
    }
    if (options.foilMask !== undefined) {
      material.uniforms.foilMask.value = options.foilMask;
    }
    if (options.uvMask !== undefined) {
      material.uniforms.uvMask.value = options.uvMask;
    }
    if (options.embossMap !== undefined) {
      material.uniforms.embossMap.value = options.embossMap;
    }
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

  // ========== Phase 2: Multi-layer support ==========

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
   * Update lighting uniforms from scene lighting information
   */
  static updateLighting(
    material: THREE.ShaderMaterial,
    lightingInfo: {
      direction: THREE.Vector3;
      color: THREE.Color;
      ambient: THREE.Color;
      cameraPosition: THREE.Vector3;
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
    if (material.uniforms.uCameraPosition) {
      material.uniforms.uCameraPosition.value.copy(lightingInfo.cameraPosition);
    }
  }

  /**
   * Update artwork texture for a specific side
   * For Phase 2, we support front/back artwork (mid layer support can be added later)
   */
  static updateArtwork(
    material: THREE.ShaderMaterial,
    side: LayerSide,
    texture: THREE.Texture | null
  ): void {
    // For now, we use a single artworkMap uniform
    // In a full implementation, we might have separate uniforms for front/back/mid
    if (side === "front" || side === "back") {
      if (texture) {
        material.uniforms.artworkMap.value = texture;
      } else {
        // Use placeholder if no texture provided
        material.uniforms.artworkMap.value = MaterialPipeline.createPlaceholderTexture(
          512,
          512,
          new THREE.Color(0.8, 0.8, 0.9)
        );
      }
    }
    // Note: mid layer artwork would require shader changes to support multiple artwork textures
  }

  /**
   * Update foil configuration for a specific side
   */
  static updateFoil(
    material: THREE.ShaderMaterial,
    side: LayerSide,
    mask: THREE.Texture | null,
    config: FoilConfig
  ): void {
    if (!config.enabled || !config.sides.includes(side)) {
      // Disable foil for this side - use black mask
      material.uniforms.foilMask.value = MaterialPipeline.createPlaceholderTexture(
        512,
        512,
        new THREE.Color(0, 0, 0)
      );
      return;
    }

    if (mask) {
      material.uniforms.foilMask.value = mask;
    } else {
      // Use placeholder mask if no custom mask provided
      // In a full implementation, this would generate a mask based on config.color and config.type
      material.uniforms.foilMask.value = MaterialPipeline.createPlaceholderTexture(
        512,
        512,
        new THREE.Color(0.5, 0.5, 0.5) // Placeholder foil mask
      );
    }
  }

  /**
   * Update UV configuration for a specific side
   */
  static updateUV(
    material: THREE.ShaderMaterial,
    side: LayerSide,
    mask: THREE.Texture | null,
    config: UVConfig
  ): void {
    if (!config.enabled || !config.sides.includes(side)) {
      // Disable UV for this side - use black mask
      material.uniforms.uvMask.value = MaterialPipeline.createPlaceholderTexture(
        512,
        512,
        new THREE.Color(0, 0, 0)
      );
      return;
    }

    if (mask) {
      material.uniforms.uvMask.value = mask;
    } else {
      // Use placeholder mask if no custom mask provided
      material.uniforms.uvMask.value = MaterialPipeline.createPlaceholderTexture(
        512,
        512,
        new THREE.Color(0.3, 0.3, 0.3) // Placeholder UV mask
      );
    }

    // Update gloss based on UV type
    if (config.type === "raised") {
      material.uniforms.uGloss.value = 0.8; // Higher gloss for raised UV
    } else if (config.type === "spot") {
      material.uniforms.uGloss.value = 0.6;
    } else {
      material.uniforms.uGloss.value = 0.4; // Lower gloss for dusting
    }
  }

  /**
   * Update emboss configuration for a specific side
   */
  static updateEmboss(
    material: THREE.ShaderMaterial,
    side: LayerSide,
    heightMap: THREE.Texture | null,
    config: EmbossConfig
  ): void {
    if (!config.enabled || !config.sides.includes(side)) {
      // Disable emboss for this side - use neutral height map
      material.uniforms.embossMap.value = MaterialPipeline.createPlaceholderTexture(
        512,
        512,
        new THREE.Color(0.5, 0.5, 0.5)
      );
      material.uniforms.uEmbossStrength.value = 0.0;
      return;
    }

    if (heightMap) {
      material.uniforms.embossMap.value = heightMap;
    } else {
      // Use placeholder height map if no custom map provided
      material.uniforms.embossMap.value = MaterialPipeline.createPlaceholderTexture(
        512,
        512,
        new THREE.Color(0.5, 0.5, 0.5)
      );
    }

    // Adjust emboss strength based on mode
    if (config.mode === "emboss") {
      material.uniforms.uEmbossStrength.value = 0.5; // Positive emboss
    } else {
      material.uniforms.uEmbossStrength.value = -0.5; // Negative deboss
    }
  }
}
