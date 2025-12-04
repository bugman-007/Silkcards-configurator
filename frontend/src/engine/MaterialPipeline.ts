import * as THREE from 'three';
import baseMaterialVertex from '../shaders/baseMaterial.glsl?raw';
import layerBlend from '../shaders/layerBlend.glsl?raw';
import foilLayerMock from '../shaders/foilLayerMock.glsl?raw';
import uvLayerMock from '../shaders/uvLayerMock.glsl?raw';
import embossLayerMock from '../shaders/embossLayerMock.glsl?raw';

/**
 * Material Pipeline
 * Builds and manages shader materials with print layer support
 */
export class MaterialPipeline {
  private material: THREE.ShaderMaterial;
  private artworkTexture: THREE.Texture;
  private foilMask: THREE.Texture;
  private uvMask: THREE.Texture;
  private embossHeightMap: THREE.Texture;

  // Layer states
  private foilEnabled: boolean = false;
  private uvEnabled: boolean = false;
  private embossEnabled: boolean = false;

  // Layer intensities
  private foilIntensity: number = 1.0;
  private uvGlossiness: number = 1.0;
  private embossIntensity: number = 1.0;

  constructor(
    artworkTexture: THREE.Texture,
    foilMask: THREE.Texture,
    uvMask: THREE.Texture,
    embossHeightMap: THREE.Texture
  ) {
    this.artworkTexture = artworkTexture;
    this.foilMask = foilMask;
    this.uvMask = uvMask;
    this.embossHeightMap = embossHeightMap;

    this.material = this.createMaterial();
  }

  /**
   * Create the shader material
   */
  private createMaterial(): THREE.ShaderMaterial {
    // Combine shader modules
    const vertexShader = baseMaterialVertex;
    
    const fragmentShader = `
precision highp float;

// Base material varyings
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

// Base artwork texture
uniform sampler2D artworkTexture;

// Lighting
uniform vec3 lightDirection;
uniform vec3 cameraPosition;

// Include all layer modules
${layerBlend}
${foilLayerMock}
${uvLayerMock}
${embossLayerMock}

void main() {
  // Base color from artwork
  vec3 baseColor = texture2D(artworkTexture, vUv).rgb;
  
  // Calculate view and light directions
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 lightDir = normalize(lightDirection);
  
  // Apply emboss layer (affects normal)
  vec3 finalNormal = applyEmbossLayer(vNormal, vUv);
  
  // Apply foil layer
  vec3 color = applyFoilLayer(baseColor, vUv, finalNormal, viewDir, lightDir);
  
  // Apply UV layer
  color = applyUVLayer(color, vUv, finalNormal, viewDir, lightDir);
  
  // Basic lighting (simple diffuse)
  float NdotL = max(dot(finalNormal, lightDir), 0.0);
  color *= 0.5 + 0.5 * NdotL; // Ambient + diffuse
  
  // Output
  gl_FragColor = vec4(color, 1.0);
}
`;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // Textures
        artworkTexture: { value: this.artworkTexture },
        foilMask: { value: this.foilMask },
        uvMask: { value: this.uvMask },
        embossHeightMap: { value: this.embossHeightMap },

        // Layer toggles
        foilEnabled: { value: this.foilEnabled },
        uvEnabled: { value: this.uvEnabled },
        embossEnabled: { value: this.embossEnabled },

        // Layer intensities
        foilIntensity: { value: this.foilIntensity },
        uvGlossiness: { value: this.uvGlossiness },
        embossIntensity: { value: this.embossIntensity },

        // Lighting (will be updated each frame)
        lightDirection: { value: new THREE.Vector3(0.5, 0.5, 0.5).normalize() },
        cameraPosition: { value: new THREE.Vector3(0, 0, 150) }
      },
      side: THREE.DoubleSide
    });
  }

  /**
   * Get the Three.js material
   */
  getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  /**
   * Update camera position uniform (call each frame)
   */
  updateCameraPosition(camera: THREE.Camera): void {
    const worldPos = new THREE.Vector3();
    camera.getWorldPosition(worldPos);
    this.material.uniforms.cameraPosition.value.copy(worldPos);
  }

  /**
   * Update light direction uniform
   */
  updateLightDirection(direction: THREE.Vector3): void {
    this.material.uniforms.lightDirection.value.copy(direction.normalize());
  }

  /**
   * Toggle foil layer
   */
  toggleFoil(enabled: boolean): void {
    this.foilEnabled = enabled;
    this.material.uniforms.foilEnabled.value = enabled;
  }

  /**
   * Toggle UV layer
   */
  toggleUV(enabled: boolean): void {
    this.uvEnabled = enabled;
    this.material.uniforms.uvEnabled.value = enabled;
  }

  /**
   * Toggle emboss layer
   */
  toggleEmboss(enabled: boolean): void {
    this.embossEnabled = enabled;
    this.material.uniforms.embossEnabled.value = enabled;
  }

  /**
   * Set foil intensity
   */
  setFoilIntensity(intensity: number): void {
    this.foilIntensity = Math.max(0, Math.min(1, intensity));
    this.material.uniforms.foilIntensity.value = this.foilIntensity;
  }

  /**
   * Set UV glossiness
   */
  setUVGlossiness(glossiness: number): void {
    this.uvGlossiness = Math.max(0, Math.min(1, glossiness));
    this.material.uniforms.uvGlossiness.value = this.uvGlossiness;
  }

  /**
   * Set emboss intensity
   */
  setEmbossIntensity(intensity: number): void {
    this.embossIntensity = Math.max(0, Math.min(1, intensity));
    this.material.uniforms.embossIntensity.value = this.embossIntensity;
  }

  /**
   * Reload shaders (for development)
   */
  async reloadShaders(): Promise<void> {
    // In a real implementation, this would reload the shader files
    // For now, we'll just recreate the material
    const oldMaterial = this.material;
    this.material = this.createMaterial();
    
    // Copy current uniform values
    this.material.uniforms.foilEnabled.value = this.foilEnabled;
    this.material.uniforms.uvEnabled.value = this.uvEnabled;
    this.material.uniforms.embossEnabled.value = this.embossEnabled;
    this.material.uniforms.foilIntensity.value = this.foilIntensity;
    this.material.uniforms.uvGlossiness.value = this.uvGlossiness;
    this.material.uniforms.embossIntensity.value = this.embossIntensity;

    oldMaterial.dispose();
  }

  /**
   * Dispose of material resources
   */
  dispose(): void {
    this.material.dispose();
  }
}

