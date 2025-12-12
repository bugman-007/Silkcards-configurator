import * as THREE from 'three';
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

/**
 * Material Pipeline
 * Simplified material pipeline with procedural finish effects
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
    artwork?: THREE.Texture;
    foilMask?: THREE.Texture;
    uvMask?: THREE.Texture;
    embossMask?: THREE.Texture;
    dieCutMask?: THREE.Texture;
  }): THREE.ShaderMaterial {
    // Create placeholder artwork if not provided
    const artwork = options.artwork || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.8, 0.8, 0.9));
    
    // Create placeholder masks (black = no effect) if not provided
    const foilMask = options.foilMask || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
    const uvMask = options.uvMask || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
    const embossMask = options.embossMask || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
    const dieCutMask = options.dieCutMask || MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));

    // Create shader material
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // Base artwork texture
        artworkMap: { value: artwork },

        // Base color tint (for stock preview)
        uBaseColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
        
        // Edge color (for card edges)
        uEdgeColor: { value: new THREE.Color(1.0, 1.0, 1.0) },

        // Finish mask textures
        foilMask: { value: foilMask },
        uvMask: { value: uvMask },
        embossMask: { value: embossMask },
        dieCutMask: { value: dieCutMask },

        // Finish toggles (boolean flags)
        foilEnabled: { value: false },
        uvEnabled: { value: false },
        embossEnabled: { value: false },
        embossStrength: { value: 0.12 },
        embossMode: { value: 1.0 }, // +1.0 for emboss (raised), -1.0 for deboss (indented)
        dieCutEnabled: { value: false },

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
}

