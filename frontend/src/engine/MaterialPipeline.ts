import * as THREE from 'three';
// Import shaders without ?raw so vite-plugin-glsl can process #include directives
import vertexShader from '../shaders/vertex.glsl';
import fragmentShader from '../shaders/fragment.glsl';

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
        uGloss: { value: 0.5 },
        uEmbossStrength: { value: 0.5 }
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
}
