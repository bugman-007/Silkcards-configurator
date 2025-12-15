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
import { ProoferState, ParsedPlate } from '../state/ProoferState.js';

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
        this.updateMaterialTexture(option, defaultMask);
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
      this.updateMaterialTexture(targetType, texture);
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

      // Cache texture
      this.loadedTextures.set(cacheKey, texture);
      
      // Update material
      this.updateMaterialTexture(targetType, texture);
      
      console.log(`[Proofer] Loaded texture for ${targetType} from plate ${plate.id}`);
    } catch (error) {
      console.error(`[Proofer] Failed to load texture for ${targetType}:`, error);
      // Use placeholder on error
      const placeholder = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5));
      this.updateMaterialTexture(targetType, placeholder);
    }
  }

  /**
   * Update material texture
   */
  private updateMaterialTexture(
    type: 'artwork' | 'foil' | 'uv' | 'emboss' | 'diecut',
    texture: THREE.Texture
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
