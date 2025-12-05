import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';
import fragmentShader from '../shaders/fragment.glsl?raw';

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
        // Texture uniforms
        uArtworkMap: { value: artwork },
        uFoilMask: { value: foilMask },
        uUvMask: { value: uvMask },
        uEmbossMap: { value: embossMap },

        // Shader module uniforms (aliased to main uniforms)
        foilMask: { value: foilMask },
        uvMask: { value: uvMask },
        embossHeightMap: { value: embossMap },

        // Material properties
        uBaseColor: { value: new THREE.Color(0.8, 0.8, 0.9) },
        uMetallic: { value: 0.0 },
        uGloss: { value: 0.5 },
        uEmbossStrength: { value: 0.5 },

        // Layer toggles (mapped to shader module uniforms)
        foilEnabled: { value: false },
        uvEnabled: { value: false },
        embossEnabled: { value: false },
        foilIntensity: { value: 1.0 },
        uvGlossiness: { value: 1.0 },
        embossIntensity: { value: 0.5 },

        // Lighting (updated per frame)
        lightDirection: { value: new THREE.Vector3(0.5, 0.5, 0.5).normalize() },
        cameraPosition: { value: new THREE.Vector3(0, 0, 150) }
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
      material.uniforms.uArtworkMap.value = options.artwork;
    }
    if (options.foilMask !== undefined) {
      material.uniforms.uFoilMask.value = options.foilMask;
      if (material.uniforms.foilMask) {
        material.uniforms.foilMask.value = options.foilMask;
      }
    }
    if (options.uvMask !== undefined) {
      material.uniforms.uUvMask.value = options.uvMask;
      if (material.uniforms.uvMask) {
        material.uniforms.uvMask.value = options.uvMask;
      }
    }
    if (options.embossMap !== undefined) {
      material.uniforms.uEmbossMap.value = options.embossMap;
      if (material.uniforms.embossHeightMap) {
        material.uniforms.embossHeightMap.value = options.embossMap;
      }
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
