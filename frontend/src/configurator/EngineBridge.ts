/**
 * Engine Bridge
 * 
 * Connects the ConfiguratorController to the 3D engine.
 * Listens to config changes and updates materials/textures accordingly.
 */

import * as THREE from 'three';
import { ConfiguratorController } from './ConfiguratorController.js';
import { ConfigState, LayerSide } from './ConfigState.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { MaterialPipeline } from '../engine/MaterialPipeline.js';

/**
 * Engine Bridge
 * 
 * Subscribes to ConfiguratorController and updates the 3D engine
 * when configuration changes.
 */
export class EngineBridge {
  private controller: ConfiguratorController;
  private material: THREE.ShaderMaterial;
  private textureCache: Map<string, THREE.Texture> = new Map();

  constructor(controller: ConfiguratorController, material: THREE.ShaderMaterial) {
    this.controller = controller;
    this.material = material;

    // Subscribe to config changes
    this.controller.addListener((state) => this.onConfigChange(state));

    // Apply initial configuration
    this.onConfigChange(this.controller.getState());
  }

  /**
   * Handle configuration changes
   */
  private async onConfigChange(state: ConfigState): Promise<void> {
    try {
      // Update artwork
      await this.updateArtwork(state);

      // Update foil for all sides
      await this.updateFoil(state);

      // Update UV for all sides
      await this.updateUV(state);

      // Update emboss for all sides
      await this.updateEmboss(state);

      // Note: Die cut and edges are visual effects that don't directly affect
      // the material pipeline in Phase 2 (they would affect geometry or rendering in later phases)
    } catch (error) {
      console.error('Error updating engine from config:', error);
    }
  }

  /**
   * Update artwork textures
   */
  private async updateArtwork(state: ConfigState): Promise<void> {
    // For Phase 2, we primarily use front artwork
    // Back and mid artwork support can be added later with shader changes
    if (state.artwork.frontArtwork) {
      const texture = await this.loadTexture(state.artwork.frontArtwork);
      MaterialPipeline.updateArtwork(this.material, "front", texture);
    } else if (state.artwork.backArtwork) {
      const texture = await this.loadTexture(state.artwork.backArtwork);
      MaterialPipeline.updateArtwork(this.material, "back", texture);
    } else {
      // Use placeholder if no artwork
      MaterialPipeline.updateArtwork(this.material, "front", null);
    }
  }

  /**
   * Update foil configuration
   */
  private async updateFoil(state: ConfigState): Promise<void> {
    // Check if foil is enabled on any side
    const foilEnabled = 
      (state.front.foil?.enabled && state.front.foil.sides.length > 0) ||
      (state.mid.foil?.enabled && state.mid.foil.sides.length > 0) ||
      (state.back.foil?.enabled && state.back.foil.sides.length > 0);

    if (!foilEnabled) {
      // Disable foil
      MaterialPipeline.updateFoil(this.material, "front", null, {
        enabled: false,
        color: "gold",
        type: "solid",
        sides: []
      });
      return;
    }

    // For Phase 2, we apply foil to the front side primarily
    // In a full implementation, we'd handle multiple sides separately
    const foilConfig = state.front.foil || state.mid.foil || state.back.foil;
    if (!foilConfig) return;

    let mask: THREE.Texture | null = null;

    // Try to load custom mask if provided
    if (foilConfig.customMask) {
      try {
        mask = await this.loadTexture(foilConfig.customMask);
      } catch (error) {
        console.warn('Failed to load custom foil mask:', error);
      }
    }

    // Apply foil configuration
    MaterialPipeline.updateFoil(this.material, "front", mask, foilConfig);
  }

  /**
   * Update UV configuration
   */
  private async updateUV(state: ConfigState): Promise<void> {
    // Check if UV is enabled on any side
    const uvEnabled = 
      (state.front.uv?.enabled && state.front.uv.sides.length > 0) ||
      (state.mid.uv?.enabled && state.mid.uv.sides.length > 0) ||
      (state.back.uv?.enabled && state.back.uv.sides.length > 0);

    if (!uvEnabled) {
      // Disable UV
      MaterialPipeline.updateUV(this.material, "front", null, {
        enabled: false,
        type: "spot",
        sides: []
      });
      return;
    }

    // For Phase 2, we apply UV to the front side primarily
    const uvConfig = state.front.uv || state.mid.uv || state.back.uv;
    if (!uvConfig) return;

    let mask: THREE.Texture | null = null;

    // Try to load custom mask if provided
    if (uvConfig.customMask) {
      try {
        mask = await this.loadTexture(uvConfig.customMask);
      } catch (error) {
        console.warn('Failed to load custom UV mask:', error);
      }
    }

    // Apply UV configuration
    MaterialPipeline.updateUV(this.material, "front", mask, uvConfig);
  }

  /**
   * Update emboss configuration
   */
  private async updateEmboss(state: ConfigState): Promise<void> {
    // Check if emboss is enabled on any side
    const embossEnabled = 
      (state.front.emboss?.enabled && state.front.emboss.sides.length > 0) ||
      (state.mid.emboss?.enabled && state.mid.emboss.sides.length > 0) ||
      (state.back.emboss?.enabled && state.back.emboss.sides.length > 0);

    if (!embossEnabled) {
      // Disable emboss
      MaterialPipeline.updateEmboss(this.material, "front", null, {
        enabled: false,
        mode: "emboss",
        sides: []
      });
      return;
    }

    // For Phase 2, we apply emboss to the front side primarily
    const embossConfig = state.front.emboss || state.mid.emboss || state.back.emboss;
    if (!embossConfig) return;

    let heightMap: THREE.Texture | null = null;

    // Try to load custom height map if provided
    if (embossConfig.heightMap) {
      try {
        heightMap = await this.loadTexture(embossConfig.heightMap);
      } catch (error) {
        console.warn('Failed to load emboss height map:', error);
      }
    }

    // Apply emboss configuration
    MaterialPipeline.updateEmboss(this.material, "front", heightMap, embossConfig);
  }

  /**
   * Load a texture, using cache if available
   */
  private async loadTexture(url: string): Promise<THREE.Texture> {
    // Check cache first
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url)!;
    }

    // Try to get from ResourceManager cache
    const cached = ResourceManager.getCachedTexture(url);
    if (cached) {
      this.textureCache.set(url, cached);
      return cached;
    }

    // Load new texture
    let texture: THREE.Texture;
    try {
      // Try loading as URL (supports object URLs from file uploads)
      texture = await ResourceManager.loadTextureFromURL(url);
    } catch (error) {
      // Fallback to regular loadTexture for file paths
      try {
        texture = await ResourceManager.loadTexture(url);
      } catch (error2) {
        console.error(`Failed to load texture from ${url}:`, error2);
        // Return placeholder
        texture = MaterialPipeline.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5));
      }
    }

    // Cache the texture
    this.textureCache.set(url, texture);
    return texture;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Note: We don't dispose textures here as they may be shared
    // ResourceManager handles disposal
    this.textureCache.clear();
  }
}

