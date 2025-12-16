/**
 * Proofer Engine Bridge
 * 
 * Connects ProoferController to the 3D engine
 * Updates material based on ProoferState
 */

import * as THREE from 'three';
import { ProoferController } from '../state/ProoferController.js';
import { MaterialPipeline } from '../../../shared/materials/MaterialPipeline.js';
import { ResourceManager } from '../../../shared/resources/ResourceManager.js';
import { CardGeometry } from '../../../shared/geometry/CardGeometry.js';
import { ProoferState, ParsedPlate, ParserPayload, ParserPlate } from '../state/ProoferState.js';

/**
 * Engine Bridge for Proofer
 * 
 * Subscribes to ProoferController and updates the 3D engine
 */
export class EngineBridge {
  private controller: ProoferController;
  private material: THREE.ShaderMaterial;
  private cardGeometry: CardGeometry;
  private loadedTextures: Map<string, THREE.Texture> = new Map();

  constructor(
    controller: ProoferController,
    material: THREE.ShaderMaterial,
    cardGeometry: CardGeometry
  ) {
    this.controller = controller;
    this.material = material;
    this.cardGeometry = cardGeometry;

    // Subscribe to state changes
    this.controller.addListener((state) => this.onStateChange(state));

    // Apply initial state
    this.onStateChange(this.controller.getState());
  }

  /**
   * Handle state changes
   */
  private onStateChange(state: ProoferState): void {
    console.log('[Proofer] EngineBridge: State changed');

    // Update card dimensions if parser payload exists
    if (state.parserPayload) {
      this.updateFromParserPayload(state);
    } else {
      // Update option toggles
      MaterialPipeline.updateFoil(this.material, state.optionStates.foil.enabled);
      MaterialPipeline.updateUV(this.material, state.optionStates.uv.enabled);
      
      const embossEnabled = state.optionStates.emboss.enabled;
      const embossMode = 1.0; // Default to emboss (raised)
      MaterialPipeline.updateEmbossParams(
        this.material,
        embossEnabled,
        0.12, // Default strength
        embossMode
      );
      
      MaterialPipeline.updateDieCut(this.material, state.optionStates.diecut.enabled);

      // Update textures from assigned plates
      this.updateTexturesFromPlates(state);
    }
  }

  /**
   * Update from parser payload
   */
  private async updateFromParserPayload(state: ProoferState): Promise<void> {
    const payload = state.parserPayload!;
    
    console.log('[Proofer] Updating from parser payload');

    // Update option toggles based on assignments
    MaterialPipeline.updateFoil(this.material, state.optionStates.foil.enabled);
    MaterialPipeline.updateUV(this.material, state.optionStates.uv.enabled);
    
    const embossEnabled = state.optionStates.emboss.enabled;
    const embossMode = 1.0; // Default to emboss (raised)
    MaterialPipeline.updateEmbossParams(
      this.material,
      embossEnabled,
      0.12, // Default strength
      embossMode
    );
    
    MaterialPipeline.updateDieCut(this.material, state.optionStates.diecut.enabled);

    // Load textures from parser payload
    await this.loadTexturesFromParserPayload(payload, state);
  }

  /**
   * Load textures from parser payload
   */
  private async loadTexturesFromParserPayload(payload: ParserPayload, state: ProoferState): Promise<void> {
    const currentSide = state.viewSide;

    // Load front print
    const printFrontPlate = payload.plates.find(p => 
      p.side === 'front' && p.type === 'PRINT' && p.depthIndex === 0
    );
    if (printFrontPlate && printFrontPlate.assets.png) {
      await this.loadTextureFromUrl(printFrontPlate.assets.png, 'artwork', 'front');
      // Apply immediately if viewing front
      if (currentSide === 'front') {
        const cacheKey = `artwork-front-mask-${printFrontPlate.assets.png}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('artwork', this.loadedTextures.get(cacheKey)!, 'front');
        }
      }
    }

    // Load back print
    const printBackPlate = payload.plates.find(p => 
      p.side === 'back' && p.type === 'PRINT' && p.depthIndex === 0
    );
    if (printBackPlate && printBackPlate.assets.png) {
      await this.loadTextureFromUrl(printBackPlate.assets.png, 'artwork', 'back');
      // Apply immediately if viewing back
      if (currentSide === 'back') {
        const cacheKey = `artwork-back-mask-${printBackPlate.assets.png}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('artwork', this.loadedTextures.get(cacheKey)!, 'back');
        }
      }
    }

    // Load foil masks
    const foilFrontPlate = payload.plates.find(p => 
      p.side === 'front' && p.type === 'FOIL_MASK' && p.depthIndex === 0
    );
    if (foilFrontPlate && foilFrontPlate.assets.maskPng) {
      await this.loadTextureFromUrl(foilFrontPlate.assets.maskPng, 'foil', 'front');
      if (currentSide === 'front' && state.optionStates.foil.enabled && state.optionStates.foil.side === 'front') {
        const cacheKey = `foil-front-mask-${foilFrontPlate.assets.maskPng}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('foil', this.loadedTextures.get(cacheKey)!, 'front');
        }
      }
    }

    const foilBackPlate = payload.plates.find(p => 
      p.side === 'back' && p.type === 'FOIL_MASK' && p.depthIndex === 0
    );
    if (foilBackPlate && foilBackPlate.assets.maskPng) {
      await this.loadTextureFromUrl(foilBackPlate.assets.maskPng, 'foil', 'back');
      if (currentSide === 'back' && state.optionStates.foil.enabled && state.optionStates.foil.side === 'back') {
        const cacheKey = `foil-back-mask-${foilBackPlate.assets.maskPng}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('foil', this.loadedTextures.get(cacheKey)!, 'back');
        }
      }
    }

    // Load UV masks
    const uvFrontPlate = payload.plates.find(p => 
      p.side === 'front' && p.type === 'SPOT_UV_MASK' && p.depthIndex === 0
    );
    if (uvFrontPlate && uvFrontPlate.assets.maskPng) {
      await this.loadTextureFromUrl(uvFrontPlate.assets.maskPng, 'uv', 'front');
      if (currentSide === 'front' && state.optionStates.uv.enabled && state.optionStates.uv.side === 'front') {
        const cacheKey = `uv-front-mask-${uvFrontPlate.assets.maskPng}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('uv', this.loadedTextures.get(cacheKey)!, 'front');
        }
      }
    }

    const uvBackPlate = payload.plates.find(p => 
      p.side === 'back' && p.type === 'SPOT_UV_MASK' && p.depthIndex === 0
    );
    if (uvBackPlate && uvBackPlate.assets.maskPng) {
      await this.loadTextureFromUrl(uvBackPlate.assets.maskPng, 'uv', 'back');
      if (currentSide === 'back' && state.optionStates.uv.enabled && state.optionStates.uv.side === 'back') {
        const cacheKey = `uv-back-mask-${uvBackPlate.assets.maskPng}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('uv', this.loadedTextures.get(cacheKey)!, 'back');
        }
      }
    }

    // Load emboss masks and height maps
    const embossFrontPlate = payload.plates.find(p => 
      p.side === 'front' && p.type === 'EMBOSS' && p.depthIndex === 0
    );
    if (embossFrontPlate) {
      // Prefer height map over mask
      if (embossFrontPlate.assets.heightPng) {
        await this.loadTextureFromUrl(embossFrontPlate.assets.heightPng, 'emboss', 'front', true);
        if (currentSide === 'front' && state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'front') {
          const cacheKey = `emboss-front-height-${embossFrontPlate.assets.heightPng}`;
          if (this.loadedTextures.has(cacheKey)) {
            this.updateMaterialTexture('emboss', this.loadedTextures.get(cacheKey)!, 'front');
          }
        }
      } else if (embossFrontPlate.assets.maskPng) {
        await this.loadTextureFromUrl(embossFrontPlate.assets.maskPng, 'emboss', 'front');
        if (currentSide === 'front' && state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'front') {
          const cacheKey = `emboss-front-mask-${embossFrontPlate.assets.maskPng}`;
          if (this.loadedTextures.has(cacheKey)) {
            this.updateMaterialTexture('emboss', this.loadedTextures.get(cacheKey)!, 'front');
          }
        }
      }
    }

    const embossBackPlate = payload.plates.find(p => 
      p.side === 'back' && p.type === 'EMBOSS' && p.depthIndex === 0
    );
    if (embossBackPlate) {
      // Prefer height map over mask
      if (embossBackPlate.assets.heightPng) {
        await this.loadTextureFromUrl(embossBackPlate.assets.heightPng, 'emboss', 'back', true);
        if (currentSide === 'back' && state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'back') {
          const cacheKey = `emboss-back-height-${embossBackPlate.assets.heightPng}`;
          if (this.loadedTextures.has(cacheKey)) {
            this.updateMaterialTexture('emboss', this.loadedTextures.get(cacheKey)!, 'back');
          }
        }
      } else if (embossBackPlate.assets.maskPng) {
        await this.loadTextureFromUrl(embossBackPlate.assets.maskPng, 'emboss', 'back');
        if (currentSide === 'back' && state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'back') {
          const cacheKey = `emboss-back-mask-${embossBackPlate.assets.maskPng}`;
          if (this.loadedTextures.has(cacheKey)) {
            this.updateMaterialTexture('emboss', this.loadedTextures.get(cacheKey)!, 'back');
          }
        }
      }
    }

    // Load diecut mask
    const diecutPlate = payload.plates.find(p => p.type === 'DIECUT');
    if (diecutPlate && diecutPlate.assets.maskPng) {
      await this.loadTextureFromUrl(diecutPlate.assets.maskPng, 'diecut', diecutPlate.side);
      if (state.optionStates.diecut.enabled) {
        const cacheKey = `diecut-${diecutPlate.side}-mask-${diecutPlate.assets.maskPng}`;
        if (this.loadedTextures.has(cacheKey)) {
          this.updateMaterialTexture('diecut', this.loadedTextures.get(cacheKey)!, diecutPlate.side);
        }
      }
    }
  }

  /**
   * Load texture from URL
   */
  private async loadTextureFromUrl(
    url: string,
    type: 'artwork' | 'foil' | 'uv' | 'emboss' | 'diecut',
    side: 'front' | 'back',
    isHeightMap: boolean = false
  ): Promise<void> {
    const cacheKey = `${type}-${side}-${isHeightMap ? 'height' : 'mask'}-${url}`;
    
    // Check cache
    if (this.loadedTextures.has(cacheKey)) {
      const texture = this.loadedTextures.get(cacheKey)!;
      this.updateMaterialTexture(type, texture, side);
      return;
    }

    try {
      const texture = await ResourceManager.loadTexture(url);
      
      // Set flipY for UV and emboss masks (as per previous fix)
      if ((type === 'uv' || type === 'emboss') && !isHeightMap) {
        texture.flipY = true;
      }
      
      // Cache texture
      this.loadedTextures.set(cacheKey, texture);
      
      // Update material
      this.updateMaterialTexture(type, texture, side);
      
      console.log(`[Proofer] Loaded texture for ${type} (${side}) from ${url}`);
    } catch (error) {
      console.error(`[Proofer] Failed to load texture for ${type} (${side}):`, error);
      // Use placeholder on error
      const placeholder = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
      this.updateMaterialTexture(type, placeholder, side);
    }
  }

  /**
   * Apply textures for current view side
   */
  private applyTexturesForSide(state: ProoferState, side: 'front' | 'back'): void {
    // Get artwork for current side
    const artworkPlate = state.parsedPlates.find(
      plate => plate.type === 'artwork' && plate.side === side
    );

    if (artworkPlate && typeof artworkPlate.file === 'string') {
      // Texture should already be loaded, just ensure it's applied
      const cacheKey = `artwork-${side}-mask-${artworkPlate.file}`;
      if (this.loadedTextures.has(cacheKey)) {
        const texture = this.loadedTextures.get(cacheKey)!;
        this.updateMaterialTexture('artwork', texture, side);
      }
    }

    // Apply finish textures for current side
    const options = ['foil', 'uv', 'emboss', 'diecut'] as const;
    for (const option of options) {
      if (!state.optionStates[option].enabled) continue;
      if (state.optionStates[option].side !== side) continue;

      const assignedPlateId = Object.keys(state.plateAssignments).find(
        id => state.plateAssignments[id].type === option &&
              state.plateAssignments[id].side === side
      );

      if (assignedPlateId) {
        const plate = state.parsedPlates.find(p => p.id === assignedPlateId);
        if (plate && typeof plate.file === 'string') {
          const cacheKey = `${option}-${side}-mask-${plate.file}`;
          if (this.loadedTextures.has(cacheKey)) {
            const texture = this.loadedTextures.get(cacheKey)!;
            this.updateMaterialTexture(option, texture, side);
          }
        }
      }
    }
  }

  /**
   * Update textures from assigned plates
   */
  private async updateTexturesFromPlates(state: ProoferState): Promise<void> {
    // Get artwork plate
    const artworkPlate = state.parsedPlates.find(
      plate => plate.type === 'artwork' && plate.side === state.viewSide
    );

    if (artworkPlate && artworkPlate.file) {
      await this.loadTextureForPlate(artworkPlate, 'artwork');
    }

    // Get assigned plates for each option
    const options = ['foil', 'uv', 'emboss', 'diecut'] as const;
    
    for (const option of options) {
      if (!state.optionStates[option].enabled) continue;

      const assignedPlateId = Object.keys(state.plateAssignments).find(
        id => state.plateAssignments[id].type === option &&
              state.plateAssignments[id].side === state.viewSide
      );

      if (assignedPlateId) {
        const plate = state.parsedPlates.find(p => p.id === assignedPlateId);
        if (plate) {
          await this.loadTextureForPlate(plate, option);
        }
      } else {
        // Use default black mask (no effect)
        const defaultMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
        this.updateMaterialTexture(option, defaultMask, state.viewSide);
      }
    }
  }

  /**
   * Load texture for plate
   */
  private async loadTextureForPlate(plate: ParsedPlate, targetType: 'artwork' | 'foil' | 'uv' | 'emboss' | 'diecut'): Promise<void> {
    const cacheKey = `${plate.id}-${targetType}`;
    
    // Check cache
    if (this.loadedTextures.has(cacheKey)) {
      const texture = this.loadedTextures.get(cacheKey)!;
      this.updateMaterialTexture(targetType, texture, plate.side);
      return;
    }

    try {
      let texture: THREE.Texture;

      if (plate.file instanceof File) {
        // Load from File object
        const url = URL.createObjectURL(plate.file);
        texture = await ResourceManager.loadTexture(url);
        URL.revokeObjectURL(url);
      } else if (typeof plate.file === 'string') {
        // Load from URL
        texture = await ResourceManager.loadTexture(plate.file);
      } else {
        // Use placeholder
        texture = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.8, 0.8, 0.9));
      }

      // Set flipY for UV and emboss masks
      if ((targetType === 'uv' || targetType === 'emboss') && plate.file instanceof File === false) {
        texture.flipY = true;
      }

      // Cache texture
      this.loadedTextures.set(cacheKey, texture);
      
      // Update material
      this.updateMaterialTexture(targetType, texture, plate.side);
      
      console.log(`[Proofer] Loaded texture for ${targetType} from plate ${plate.id}`);
    } catch (error) {
      console.error(`[Proofer] Failed to load texture for ${targetType}:`, error);
      // Use placeholder on error
      const placeholder = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5));
      this.updateMaterialTexture(targetType, placeholder, plate.side);
    }
  }

  /**
   * Update material texture
   */
  private updateMaterialTexture(
    type: 'artwork' | 'foil' | 'uv' | 'emboss' | 'diecut',
    texture: THREE.Texture,
    side?: 'front' | 'back'
  ): void {
    switch (type) {
      case 'artwork':
        if (this.material.uniforms.artworkMap) {
          this.material.uniforms.artworkMap.value = texture;
        }
        break;
      case 'foil':
        if (this.material.uniforms.foilMask) {
          this.material.uniforms.foilMask.value = texture;
        }
        break;
      case 'uv':
        if (this.material.uniforms.uvMask) {
          this.material.uniforms.uvMask.value = texture;
        }
        break;
      case 'emboss':
        if (this.material.uniforms.embossMask) {
          this.material.uniforms.embossMask.value = texture;
        }
        break;
      case 'diecut':
        if (this.material.uniforms.dieCutMask) {
          this.material.uniforms.dieCutMask.value = texture;
        }
        break;
    }
    this.material.needsUpdate = true;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Dispose cached textures
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();
  }
}
