/**
 * Proofer Engine Bridge
 * 
 * Connects ProoferController to the 3D engine
 * Uses FaceStack architecture: separate materials per ply/face
 */

import * as THREE from 'three';
import { ProoferController } from '../state/ProoferController.js';
import { MaterialPipeline } from '../materials/MaterialPipeline.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { CardGeometry } from '../geometry/CardGeometry.js';
import { ProoferState, PlyStack, Composites } from '../state/ProoferState.js';

/**
 * Engine Bridge for Proofer
 * 
 * Manages materials per ply/face using FaceStack architecture
 * Materials are created/updated when FaceStacks are available
 */
export class EngineBridge {
  private controller: ProoferController;
  private cardGeometry: CardGeometry;
  
  // Materials per ply/face: key = "ply{index}_{face}"
  private materials: Map<string, THREE.ShaderMaterial> = new Map();
  
  // Composites cache: key = "ply{index}"
  private compositesCache: Map<string, Composites> = new Map();
  
  // Callback to notify when materials are ready (for ProoferUI)
  private onMaterialsReadyCallback: (() => void) | null = null;

  constructor(
    controller: ProoferController,
    cardGeometry: CardGeometry
  ) {
    this.controller = controller;
    this.cardGeometry = cardGeometry;

    // Subscribe to state changes
    this.controller.addListener((state) => this.onStateChange(state));

    // Apply initial state
    this.onStateChange(this.controller.getState());
  }

  /**
   * Get material for a specific ply/face
   * Used by ProoferUI to create meshes
   */
  getMaterial(plyIndex: number, face: 'front' | 'back'): THREE.ShaderMaterial | null {
    const key = `ply${plyIndex}_${face}`;
    return this.materials.get(key) || null;
  }

  /**
   * Get all materials (for cleanup/disposal)
   */
  getAllMaterials(): THREE.ShaderMaterial[] {
    return Array.from(this.materials.values());
  }

  /**
   * Set callback to be notified when materials are ready
   * Used by ProoferUI to update meshes after async material creation
   */
  setOnMaterialsReadyCallback(callback: () => void): void {
    this.onMaterialsReadyCallback = callback;
  }

  /**
   * Handle state changes
   */
  private onStateChange(state: ProoferState): void {
    console.log('[Proofer] EngineBridge: State changed');

    // Update geometry dimensions (including plyCount)
    if (state.parserPayload || state.plyCount) {
      this.cardGeometry.updateDimensions(
        state.width,
        state.height,
        state.thickness,
        state.cornerRadius,
        state.plyCount || 1
      );
    }

    // Update from FaceStacks if available (new architecture)
    if (state.faceStacks && state.faceStacks.size > 0) {
      this.updateFromFaceStacks(state);
    } else if (state.parserPayload) {
      // Fallback: old architecture (should not happen if FaceStacks are built)
      console.warn('[EngineBridge] Parser payload exists but no FaceStacks - using fallback');
      this.updateFromParserPayloadFallback(state);
    } else {
      // No parser payload - update debug flags only
      this.updateDebugFlags();
    }
  }

  /**
   * Update from FaceStacks (new architecture)
   * This is the main orchestration method
   */
  private async updateFromFaceStacks(state: ProoferState): Promise<void> {
    if (!state.faceStacks || !state.parserPayload) {
      console.warn('[EngineBridge] Cannot update from FaceStacks: missing data');
      return;
    }

    const jobId = state.parserPayload.jobId || 'unknown';
    console.log(`[EngineBridge] Updating from FaceStacks (${state.faceStacks.size} plies)`);

    // Update debug flags on all existing materials
    this.updateDebugFlags();

    // For each ply, build composites and create/update materials
    for (const [plyIndex, plyStack] of state.faceStacks) {
      try {
        // Build composites using ResourceManager
        const compositesMap = await ResourceManager.buildComposites(plyStack, jobId);
        const composites = compositesMap.get(`ply${plyIndex}`);
        
        if (!composites) {
          console.warn(`[EngineBridge] No composites built for ply ${plyIndex}`);
          continue;
        }

        // Cache composites
        this.compositesCache.set(`ply${plyIndex}`, composites);

        // Create/update materials for front and back faces
        await this.updateMaterialsForPly(plyIndex, composites, state);

        console.log(`[EngineBridge] Updated materials for ply ${plyIndex}`, {
          frontMaterial: !!this.materials.get(`ply${plyIndex}_front`),
          backMaterial: !!this.materials.get(`ply${plyIndex}_back`),
          frontPrint: !!composites.frontPrint,
          backPrint: !!composites.backPrint
        });
      } catch (error) {
        console.error(`[EngineBridge] Failed to update ply ${plyIndex}:`, error);
      }
    }

    // Notify ProoferUI that materials are ready (trigger mesh update)
    if (this.onMaterialsReadyCallback) {
      console.log('[EngineBridge] Materials ready, notifying ProoferUI to update meshes');
      this.onMaterialsReadyCallback();
    }
  }

  /**
   * Create or update materials for a specific ply
   */
  private async updateMaterialsForPly(
    plyIndex: number,
    composites: Composites,
    state: ProoferState
  ): Promise<void> {
    // Create placeholder textures
    const whitePrint = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(1.0, 1.0, 1.0));
    const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0), THREE.NoColorSpace);
    blackMask.generateMipmaps = false;
    blackMask.minFilter = THREE.LinearFilter;
    blackMask.magFilter = THREE.LinearFilter;

    // Front material
    const frontKey = `ply${plyIndex}_front`;
    let frontMaterial = this.materials.get(frontKey);
    
    if (!frontMaterial) {
      // Create new material
      console.log(`[EngineBridge] Creating NEW front material for ply${plyIndex}:`, {
        hasPrint: !!composites.frontPrint,
        printSize: composites.frontPrint ? `${composites.frontPrint.image.width}x${composites.frontPrint.image.height}` : 'null',
        hasFoilMask: !!composites.frontFoilMask,
        hasUvMask: !!composites.frontUvMask,
        hasEmbossMask: !!composites.frontEmbossMask
      });
      frontMaterial = MaterialPipeline.createCardMaterial({
        isFront: true,
        printMap: composites.frontPrint || whitePrint,
        foilMask: composites.frontFoilMask || blackMask,
        uvMask: composites.frontUvMask || blackMask,
        embossMask: composites.frontEmbossMask || blackMask,
        diecutMask: composites.diecutMask || blackMask
      });
      this.materials.set(frontKey, frontMaterial);
      console.log(`[EngineBridge] Front material created, uniforms:`, {
        uPrintMap: !!frontMaterial.uniforms.uPrintMap?.value,
        printMapUUID: frontMaterial.uniforms.uPrintMap?.value?.uuid
      });
    } else {
      // Update existing material
      console.log(`[EngineBridge] Updating EXISTING front material for ply${plyIndex}`);
      if (composites.frontPrint) {
        MaterialPipeline.updatePrintMap(frontMaterial, composites.frontPrint);
        console.log(`[EngineBridge] Updated frontPrint:`, composites.frontPrint.uuid);
      }
      if (composites.frontFoilMask) {
        MaterialPipeline.updateFoilMask(frontMaterial, composites.frontFoilMask);
      }
      if (composites.frontUvMask) {
        MaterialPipeline.updateUvMask(frontMaterial, composites.frontUvMask);
      }
      if (composites.frontEmbossMask) {
        MaterialPipeline.updateEmbossMask(frontMaterial, composites.frontEmbossMask);
      }
      if (composites.diecutMask) {
        MaterialPipeline.updateDiecutMask(frontMaterial, composites.diecutMask);
      }
    }

    // Update finish toggles for front
    MaterialPipeline.updateFoil(frontMaterial, state.optionStates.foil.enabled && state.optionStates.foil.side === 'front');
    MaterialPipeline.updateUV(frontMaterial, state.optionStates.uv.enabled && state.optionStates.uv.side === 'front');
    MaterialPipeline.updateEmbossParams(
      frontMaterial,
      state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'front',
      0.12,
      1.0
    );
    MaterialPipeline.updateDieCut(frontMaterial, state.optionStates.diecut.enabled);

    // Back material
    const backKey = `ply${plyIndex}_back`;
    let backMaterial = this.materials.get(backKey);
    
    if (!backMaterial) {
      // Create new material
      console.log(`[EngineBridge] Creating NEW back material for ply${plyIndex}:`, {
        hasPrint: !!composites.backPrint,
        printSize: composites.backPrint ? `${composites.backPrint.image.width}x${composites.backPrint.image.height}` : 'null',
        hasFoilMask: !!composites.backFoilMask,
        hasUvMask: !!composites.backUvMask,
        hasEmbossMask: !!composites.backEmbossMask
      });
      backMaterial = MaterialPipeline.createCardMaterial({
        isFront: false,
        printMap: composites.backPrint || whitePrint,
        foilMask: composites.backFoilMask || blackMask,
        uvMask: composites.backUvMask || blackMask,
        embossMask: composites.backEmbossMask || blackMask,
        diecutMask: composites.diecutMask || blackMask
      });
      this.materials.set(backKey, backMaterial);
      console.log(`[EngineBridge] Back material created, uniforms:`, {
        uPrintMap: !!backMaterial.uniforms.uPrintMap?.value,
        printMapUUID: backMaterial.uniforms.uPrintMap?.value?.uuid
      });
    } else {
      // Update existing material
      console.log(`[EngineBridge] Updating EXISTING back material for ply${plyIndex}`);
      if (composites.backPrint) {
        MaterialPipeline.updatePrintMap(backMaterial, composites.backPrint);
        console.log(`[EngineBridge] Updated backPrint:`, composites.backPrint.uuid);
      }
      if (composites.backFoilMask) {
        MaterialPipeline.updateFoilMask(backMaterial, composites.backFoilMask);
      }
      if (composites.backUvMask) {
        MaterialPipeline.updateUvMask(backMaterial, composites.backUvMask);
      }
      if (composites.backEmbossMask) {
        MaterialPipeline.updateEmbossMask(backMaterial, composites.backEmbossMask);
      }
      if (composites.diecutMask) {
        MaterialPipeline.updateDiecutMask(backMaterial, composites.diecutMask);
      }
    }

    // Update finish toggles for back
    MaterialPipeline.updateFoil(backMaterial, state.optionStates.foil.enabled && state.optionStates.foil.side === 'back');
    MaterialPipeline.updateUV(backMaterial, state.optionStates.uv.enabled && state.optionStates.uv.side === 'back');
    MaterialPipeline.updateEmbossParams(
      backMaterial,
      state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'back',
      0.12,
      1.0
    );
    MaterialPipeline.updateDieCut(backMaterial, state.optionStates.diecut.enabled);
  }

  /**
   * Update debug flags on all materials
   */
  private updateDebugFlags(): void {
    const debugFlags = (window as any).__PROOFER_DEBUG__ || {};
    for (const material of this.materials.values()) {
      MaterialPipeline.updateDebugFlags(material, {
        showFaceId: !!debugFlags.showFaceId,
        showPrintOnly: !!debugFlags.showPrintOnly,
        showFoilOnly: !!debugFlags.showFoilOnly,
        showMaskOnly: !!debugFlags.showMaskOnly
      });
    }
  }

  /**
   * Fallback: Update from parser payload (old architecture)
   * This should not be needed if FaceStacks are properly built
   */
  private async updateFromParserPayloadFallback(state: ProoferState): Promise<void> {
    console.warn('[EngineBridge] Using fallback update method - FaceStacks should be used instead');
    // This is a minimal fallback - just update debug flags
    this.updateDebugFlags();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Dispose all materials
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    this.compositesCache.clear();
  }
}
