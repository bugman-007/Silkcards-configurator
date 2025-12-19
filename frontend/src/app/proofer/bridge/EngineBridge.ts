/**
 * Proofer Engine Bridge
 * 
 * Connects ProoferController to the 3D engine
 * Updates material based on ProoferState
 */

import * as THREE from 'three';
import { ProoferController } from '../state/ProoferController.js';
import { MaterialPipeline } from '../materials/MaterialPipeline.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { CardGeometry } from '../geometry/CardGeometry.js';
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
  private composedTextures: Map<string, THREE.Texture> = new Map();

  constructor(
    controller: ProoferController,
    material: THREE.ShaderMaterial,
    cardGeometry: CardGeometry
  ) {
    this.controller = controller;
    this.material = material;
    this.cardGeometry = cardGeometry;

    // Z-fighting / ordering hygiene (single-material pipeline, but prevents depth artifacts when discard/alpha is used)
    this.material.depthWrite = false;
    this.material.depthTest = true;

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

    // Update option toggle flags first
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

    // Clear masks for disabled options BEFORE loading parser masks
    // This ensures disabled effects don't show residual textures
    // Enabled options will have their masks overwritten by parser masks below
    const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
    if (!state.optionStates.foil.enabled) {
      this.updateMaterialTexture('foil', blackMask);
      console.log('[EngineBridge] Foil disabled - cleared mask');
    }
    if (!state.optionStates.uv.enabled) {
      this.updateMaterialTexture('uv', blackMask);
      console.log('[EngineBridge] UV disabled - cleared mask');
    }
    if (!state.optionStates.emboss.enabled) {
      this.updateMaterialTexture('emboss', blackMask);
      console.log('[EngineBridge] Emboss disabled - cleared mask');
    }
    if (!state.optionStates.diecut.enabled) {
      this.updateMaterialTexture('diecut', blackMask);
      console.log('[EngineBridge] Diecut disabled - cleared mask');
    }

    // Load and apply textures from parser payload
    // This will apply parser masks when enabled, or leave black placeholders when disabled/missing
    await this.loadTexturesFromParserPayload(payload, state);
  }

  /**
   * Load textures from parser payload
   */
  private async loadTexturesFromParserPayload(payload: ParserPayload, state: ProoferState): Promise<void> {
    const currentSide = state.viewSide;

    // PRINT: stack/composite all print plates for each side, sorted by depthIndex
    await this.composeAndApplyPrint(payload, 'front', currentSide);
    await this.composeAndApplyPrint(payload, 'back', currentSide);

    // Masks: union/max across all depths (single-mask shader constraint)
    // Always compose for both sides - shader selects based on vFaceType
    await this.composeAndApplyMask(payload, 'FOIL_MASK', 'foil', 'front', currentSide, state);
    await this.composeAndApplyMask(payload, 'FOIL_MASK', 'foil', 'back', currentSide, state);

    await this.composeAndApplyMask(payload, 'SPOT_UV_MASK', 'uv', 'front', currentSide, state);
    await this.composeAndApplyMask(payload, 'SPOT_UV_MASK', 'uv', 'back', currentSide, state);

    await this.composeAndApplyEmboss(payload, 'front', currentSide, state);
    await this.composeAndApplyEmboss(payload, 'back', currentSide, state);

    // Die-cut: prefer mask plates; SVG is preserved in meta but not used by current shader pipeline
    // Apply to both sides when enabled
    if (state.optionStates.diecut.enabled) {
      await this.composeAndApplyMask(payload, 'DIECUT_MASK', 'diecut', 'front', currentSide, state);
      await this.composeAndApplyMask(payload, 'DIECUT_MASK', 'diecut', 'back', currentSide, state);
    } else {
      // Disable diecut on both sides with black mask
      const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
      this.updateMaterialTexture('diecut', blackMask, 'front');
      this.updateMaterialTexture('diecut', blackMask, 'back');
    }
  }

  private getPlatesSorted(payload: ParserPayload, side: 'front' | 'back', type: string): ParserPlate[] {
    return payload.plates
      .filter(p => (p.face ?? p.side) === side && p.type === (type as any))
      .slice()
      .sort((a, b) => (a.depthIndex ?? 0) - (b.depthIndex ?? 0) || a.id.localeCompare(b.id));
  }

  private async composeAndApplyPrint(payload: ParserPayload, side: 'front' | 'back', _currentSide: 'front' | 'back'): Promise<void> {
    const printPlates = this.getPlatesSorted(payload, side, 'PRINT').filter(p => !!p.assets.png);
    if (printPlates.length === 0) {
      console.log(`[EngineBridge] No PRINT plates found for side: ${side}`);
      return;
    }

    const urls = printPlates.map(p => p.assets.png!);
    console.log(`[EngineBridge] Composing print for ${side}:`, urls.length, 'layers');
    const composed = await this.getOrComposeStackedTexture(`print:${side}`, urls, 'stack');
    console.log(`[EngineBridge] Composed texture UUID for ${side}:`, composed?.uuid);

    // Always apply texture to the appropriate face (front or back)
    // Shader will use the correct texture based on vFaceType
    this.updateMaterialTexture('artwork', composed, side);
  }

  private async composeAndApplyMask(
    payload: ParserPayload,
    plateType: string,
    target: 'foil' | 'uv' | 'diecut',
    side: 'front' | 'back',
    _currentSide: 'front' | 'back', // Not used - masks applied based on optionState.side
    state: ProoferState
  ): Promise<void> {
    const plates = this.getPlatesSorted(payload, side, plateType).filter(p => !!p.assets.maskPng);
    
    const optionState =
      target === 'foil' ? state.optionStates.foil :
      target === 'uv' ? state.optionStates.uv :
      state.optionStates.diecut;

    // If no parser masks exist for this effect/side, use black placeholder (no effect)
    // DO NOT fall back to demo masks - parser is source of truth
    if (plates.length === 0) {
      // Only apply black placeholder if this is the enabled side
      // Masks are global uniforms (one per effect type), so apply for enabled side only
      if (optionState.enabled && optionState.side === side) {
        console.log(`[EngineBridge] No ${target} parser mask found for ${side}, using black placeholder (no effect)`);
        const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
        this.updateMaterialTexture(target, blackMask, side);
      }
      return;
    }

    const urls = plates.map(p => p.assets.maskPng!);
    console.log(`[EngineBridge] Composing ${target} parser mask for ${side}:`, urls.length, 'layers');
    const composed = await this.getOrComposeStackedTexture(`mask:${plateType}:${side}`, urls, 'max');
    console.log(`[EngineBridge] Composed ${target} parser mask UUID for ${side}:`, composed?.uuid);

    // Apply parser mask when enabled and this is the enabled side
    // Masks are global uniforms (one per effect type), so we apply the mask for the enabled side
    // Shader uses the same mask for both faces, but the effect is controlled by enabled flag
    if (optionState.enabled && optionState.side === side) {
      console.log(`[EngineBridge] Applying ${target} parser mask for enabled side: ${side}`);
      this.updateMaterialTexture(target, composed, side);
    }
  }

  private async composeAndApplyEmboss(
    payload: ParserPayload,
    side: 'front' | 'back',
    _currentSide: 'front' | 'back', // Not used - masks applied based on optionState.side
    state: ProoferState
  ): Promise<void> {
    const plates = this.getPlatesSorted(payload, side, 'EMBOSS');
    
    // If no parser emboss maps exist for this side, use black placeholder (no effect)
    // DO NOT fall back to demo masks - parser is source of truth
    if (plates.length === 0) {
      if (state.optionStates.emboss.enabled && state.optionStates.emboss.side === side) {
        console.log(`[EngineBridge] No emboss map found for ${side}, using black placeholder (effect disabled)`);
        const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
        this.updateMaterialTexture('emboss', blackMask, side);
      }
      return;
    }

    // Prefer height maps if present; otherwise merge masks.
    const heightUrls = plates.map(p => p.assets.heightPng).filter(Boolean) as string[];
    const maskUrls = plates.map(p => p.assets.maskPng).filter(Boolean) as string[];
    const urls = heightUrls.length > 0 ? heightUrls : maskUrls;
    if (urls.length === 0) {
      if (state.optionStates.emboss.enabled && state.optionStates.emboss.side === side) {
        console.log(`[EngineBridge] No emboss assets found for ${side}, using black placeholder`);
        const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
        this.updateMaterialTexture('emboss', blackMask, side);
      }
      return;
    }

    console.log(`[EngineBridge] Composing emboss for ${side}:`, urls.length, 'layers', heightUrls.length > 0 ? '(height maps)' : '(masks)');
    const composed = await this.getOrComposeStackedTexture(`emboss:${side}:${heightUrls.length > 0 ? 'height' : 'mask'}`, urls, 'max');
    console.log(`[EngineBridge] Composed emboss UUID for ${side}:`, composed?.uuid);

    // Always apply parser emboss maps when enabled and side matches
    // Shader will use correct texture based on vFaceType
    if (state.optionStates.emboss.enabled && state.optionStates.emboss.side === side) {
      this.updateMaterialTexture('emboss', composed, side);
    }
  }

  private async getOrComposeStackedTexture(
    cacheKey: string,
    urls: string[],
    mode: 'stack' | 'max'
  ): Promise<THREE.Texture> {
    const signature = `${cacheKey}::${urls.join('|')}`;
    const cached = this.composedTextures.get(signature);
    if (cached) return cached;

    // Load all source textures first (in stable order)
    const textures = await Promise.all(urls.map((u) => ResourceManager.loadTexture(u)));
    const images = textures.map(t => t.image as any).filter(Boolean);
    if (images.length === 0) {
      // Fallback: black (no effect)
      return ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
    }

    const w = images[0].width || images[0].naturalWidth;
    const h = images[0].height || images[0].naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: mode === 'max' })!;

    if (mode === 'stack') {
      for (const img of images) {
        ctx.drawImage(img, 0, 0, w, h);
      }
    } else {
      // Union/max per-channel across all layers.
      // (We only need grayscale masks, but max per channel is robust for colored inputs.)
      const accum = new Uint8ClampedArray(w * h * 4);
      for (const img of images) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let i = 0; i < accum.length; i++) {
          if (data[i] > accum[i]) accum[i] = data[i];
        }
      }
      const out = ctx.createImageData(w, h);
      out.data.set(accum);
      ctx.putImageData(out, 0, 0);
    }

    const outTex = new THREE.CanvasTexture(canvas);
    outTex.flipY = false;
    outTex.colorSpace = THREE.SRGBColorSpace;
    outTex.needsUpdate = true;

    this.composedTextures.set(signature, outTex);
    return outTex;
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
        // Apply artwork texture to the appropriate face (front or back)
        if (side === 'front' && this.material.uniforms.frontArtworkMap) {
          console.log('[EngineBridge] Setting frontArtworkMap:', texture?.uuid, 'side:', side);
          // Set texture and mark for update
          texture.needsUpdate = true;
          this.material.uniforms.frontArtworkMap.value = texture;
          this.material.needsUpdate = true;
        } else if (side === 'back' && this.material.uniforms.backArtworkMap) {
          console.log('[EngineBridge] Setting backArtworkMap:', texture?.uuid, 'side:', side);
          // Set texture and mark for update
          texture.needsUpdate = true;
          this.material.uniforms.backArtworkMap.value = texture;
          this.material.needsUpdate = true;
        } else {
          console.warn('[EngineBridge] Invalid artwork update - side:', side, 'uniforms available:', {
            front: !!this.material.uniforms.frontArtworkMap,
            back: !!this.material.uniforms.backArtworkMap
          });
        }
        break;
      case 'foil':
        if (this.material.uniforms.foilMask) {
          console.log('[EngineBridge] Setting foilMask:', texture?.uuid, 'side:', side || 'global');
          texture.needsUpdate = true;
          this.material.uniforms.foilMask.value = texture;
          this.material.needsUpdate = true;
        }
        break;
      case 'uv':
        if (this.material.uniforms.uvMask) {
          console.log('[EngineBridge] Setting uvMask:', texture?.uuid, 'side:', side || 'global');
          texture.needsUpdate = true;
          this.material.uniforms.uvMask.value = texture;
          this.material.needsUpdate = true;
        }
        break;
      case 'emboss':
        if (this.material.uniforms.embossMask) {
          console.log('[EngineBridge] Setting embossMask:', texture?.uuid, 'side:', side || 'global');
          texture.needsUpdate = true;
          this.material.uniforms.embossMask.value = texture;
          this.material.needsUpdate = true;
        }
        break;
      case 'diecut':
        if (this.material.uniforms.dieCutMask) {
          console.log('[EngineBridge] Setting dieCutMask:', texture?.uuid, 'side:', side || 'global');
          texture.needsUpdate = true;
          this.material.uniforms.dieCutMask.value = texture;
          this.material.needsUpdate = true;
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
    this.composedTextures.forEach(texture => texture.dispose());
    this.composedTextures.clear();
  }
}
