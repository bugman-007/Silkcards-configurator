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
  
  // Die-cut geometry cache key (avoid re-parsing SVG every frame)
  private diecutGeometryKey: string | null = null;
  
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
   * Get materials array for a ply box (with edge material)
   * Material array order for BoxGeometry: [right, left, top, bottom, front, back]
   * @param plyIndex - The ply index
   * @param edgeMaterial - Material for edge faces
   * @returns Array of 6 materials or null if front/back materials not available
   */
  getPlyBoxMaterials(
    plyIndex: number,
    edgeMaterial: THREE.Material
  ): THREE.Material[] | null {
    const frontMaterial = this.getMaterial(plyIndex, 'front');
    const backMaterial = this.getMaterial(plyIndex, 'back');
    
    if (!frontMaterial || !backMaterial) {
      return null;
    }

    // BoxGeometry material array: [right, left, top, bottom, front, back]
    return [
      edgeMaterial, // right
      edgeMaterial, // left
      edgeMaterial, // top
      edgeMaterial, // bottom
      frontMaterial, // front
      backMaterial   // back
    ];
  }

  getPlyCapMaterials(plyIndex: number): { front: THREE.ShaderMaterial; back: THREE.ShaderMaterial } {
    const front = this.getMaterial(plyIndex, "front");
    const back = this.getMaterial(plyIndex, "back");
    if (!front || !back) throw new Error(`Missing cap materials for ply ${plyIndex}`);
  
    // If geometry provides holes, DO NOT let shader discard cut again.
    if (front.uniforms?.dieCutEnabled) front.uniforms.dieCutEnabled.value = false;
    if (back.uniforms?.dieCutEnabled) back.uniforms.dieCutEnabled.value = false;
  
    return { front, back };
  }

  /**
   * Get materials for extruded geometry (ExtrudeGeometry with diecut)
   * ExtrudeGeometry uses material groups: [sides, top, bottom]
   * 
   * @param plyIndex - The ply index
   * @param sideMaterial - Material for side walls (typically MeshStandardMaterial)
   * @returns Array of 3 materials or null if front/back materials not available
   */
  getPlyExtrudeMaterials(
    plyIndex: number,
    sideMaterial: THREE.Material
  ): THREE.Material[] | null {
    const frontMaterial = this.getMaterial(plyIndex, 'front');
    const backMaterial = this.getMaterial(plyIndex, 'back');
    if (!frontMaterial || !backMaterial) return null;

    // IMPORTANT: geometry already has diecut; shader discard must be OFF
    if (frontMaterial.uniforms?.dieCutEnabled) frontMaterial.uniforms.dieCutEnabled.value = false;
    if (backMaterial.uniforms?.dieCutEnabled) backMaterial.uniforms.dieCutEnabled.value = false;

    // ExtrudeGeometry material order: [sides, top, bottom]
    return [sideMaterial, frontMaterial, backMaterial];
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
   * Update CardGeometry with die-cut interior walls using the DIECUT SVG.
   * This is independent from diecut masking in the shader (which only makes a flat hole).
   */
  private async updateDiecutGeometry(state: ProoferState): Promise<void> {
    const payload: any = (state as any).parserPayload ?? null;
  
    const jobId: string | undefined =
      payload?.jobId ?? payload?.id ?? payload?.job ?? (state as any).jobId;
  
    if (!jobId) {
      if (this.diecutGeometryKey !== null) {
        this.diecutGeometryKey = null;
        this.cardGeometry.setDiecutOutlines(null);
      }
      return;
    }
  
    // Prefer ply0 diecut from FaceStacks (this is what your mask compositor uses)
    let diecutPlate: any = null;
    const faceStacks: any = (state as any).faceStacks;
  
    if (faceStacks && typeof faceStacks.values === 'function') {
      const stacks = Array.from(faceStacks.values()) as any[];
      const ply0 = stacks.find((s) => s?.plyIndex === 0) ?? stacks[0] ?? null;
      diecutPlate = ply0?.front?.diecut ?? ply0?.back?.diecut ?? null;
    }
  
    // Fallback: try parserPayload.plates (kept for compatibility)
    if (!diecutPlate) {
      const plates: any[] = Array.isArray(payload?.plates) ? payload.plates : [];
      diecutPlate = plates.find((p) => {
        const t = String(p?.type || '').toUpperCase();
        return (t.includes('DIE') && t.includes('CUT')) || t === 'DIECUT' || t === 'DIE_CUT';
      }) ?? null;
    }
  
    const key = diecutPlate
      ? `${jobId}|${diecutPlate.id ?? diecutPlate.name ?? 'diecut'}|${state.width}|${state.height}`
      : `${jobId}|__NO_DIECUT__|${state.width}|${state.height}`;
  
    if (this.diecutGeometryKey === key) return;
    this.diecutGeometryKey = key;
  
    if (!diecutPlate) {
      console.log('[EngineBridge] No DIECUT plate found for geometry; clearing outlines');
      this.cardGeometry.setDiecutOutlines(null);
      return;
    }
  
    console.log('[EngineBridge] Loading DIECUT SVG outlines for geometry:', diecutPlate.id ?? diecutPlate.name ?? '(no id)');
  
    const outlines = await ResourceManager.loadDiecutOutlinesForPlate(
      diecutPlate,
      jobId,
      state.width,
      state.height,
      3 // tighter sampling than default=4
    );
  
    if (!outlines || outlines.length === 0) {
      console.warn('[EngineBridge] DIECUT SVG resolved but produced NO outlines (staying shader-only)');
      this.cardGeometry.setDiecutOutlines(null);
      return;
    }
  
    console.log('[EngineBridge] DIECUT outlines loaded:', outlines.length, 'loop(s)');
    this.cardGeometry.setDiecutOutlines(outlines);
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

    // Ensure CardGeometry includes die-cut outlines (SVG)
    await this.updateDiecutGeometry(state);

    // FIX: jobId must match parser payload schema (jobId OR id)
    const payload: any = state.parserPayload;
    const jobId: string | undefined =
      payload?.jobId ?? payload?.id ?? payload?.job ?? (state as any).jobId;

    if (!jobId) {
      console.warn('[EngineBridge] Missing jobId/id in parserPayload; cannot load composites/textures');
      return;
    }

    console.log(`[EngineBridge] Updating from FaceStacks (${state.faceStacks.size} plies), jobId=${jobId}`);

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
    // Enable per-side: only enable if global toggle is on AND mask exists for this side
    const foilFrontEnabled = state.optionStates.foil.enabled && state.optionStates.foil.side === 'front' && !!composites.frontFoilMask;
    const uvFrontEnabled = state.optionStates.uv.enabled && state.optionStates.uv.side === 'front' && !!composites.frontUvMask;
    const embossFrontEnabled = state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'front' && !!composites.frontEmbossMask;
    
    // Geometry diecut is only intended for ply0 (the first ply)
    const geometryDiecutActive =
      plyIndex === 0 &&
      state.optionStates?.diecut?.enabled === true &&
      this.cardGeometry.usesDiecutGeometry?.() === true;

    // If geometry diecut is active, shader discard MUST be OFF (otherwise you get "paper cut")
    const diecutFrontEnabled = state.optionStates.diecut.enabled && !!composites.diecutMask && !geometryDiecutActive;
    
    MaterialPipeline.updateFoil(frontMaterial, foilFrontEnabled);
    MaterialPipeline.updateUV(frontMaterial, uvFrontEnabled);
    MaterialPipeline.updateEmbossParams(frontMaterial, embossFrontEnabled, 0.12, 1.0);
    MaterialPipeline.updateDieCut(frontMaterial, diecutFrontEnabled);
    
    // Debug logging for uniform binding verification
    console.log(`[EngineBridge] Front material finish toggles (ply${plyIndex}):`, {
      foilEnabled: foilFrontEnabled,
      foilTexture: !!composites.frontFoilMask,
      uvEnabled: uvFrontEnabled,
      uvTexture: !!composites.frontUvMask,
      embossEnabled: embossFrontEnabled,
      embossTexture: !!composites.frontEmbossMask,
      diecutEnabled: diecutFrontEnabled,
      diecutTexture: !!composites.diecutMask
    });

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
    // Enable per-side: only enable if global toggle is on AND mask exists for this side
    const foilBackEnabled = state.optionStates.foil.enabled && state.optionStates.foil.side === 'back' && !!composites.backFoilMask;
    const uvBackEnabled = state.optionStates.uv.enabled && state.optionStates.uv.side === 'back' && !!composites.backUvMask;
    const embossBackEnabled = state.optionStates.emboss.enabled && state.optionStates.emboss.side === 'back' && !!composites.backEmbossMask;
    
    const diecutBackEnabled = state.optionStates.diecut.enabled && !!composites.diecutMask && !geometryDiecutActive;
    
    MaterialPipeline.updateFoil(backMaterial, foilBackEnabled);
    MaterialPipeline.updateUV(backMaterial, uvBackEnabled);
    MaterialPipeline.updateEmbossParams(backMaterial, embossBackEnabled, 0.12, 1.0);
    MaterialPipeline.updateDieCut(backMaterial, diecutBackEnabled);
    
    // Debug logging for uniform binding verification
    console.log(`[EngineBridge] Back material finish toggles (ply${plyIndex}):`, {
      foilEnabled: foilBackEnabled,
      foilTexture: !!composites.backFoilMask,
      uvEnabled: uvBackEnabled,
      uvTexture: !!composites.backUvMask,
      embossEnabled: embossBackEnabled,
      embossTexture: !!composites.backEmbossMask,
      diecutEnabled: diecutBackEnabled,
      diecutTexture: !!composites.diecutMask
    });
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