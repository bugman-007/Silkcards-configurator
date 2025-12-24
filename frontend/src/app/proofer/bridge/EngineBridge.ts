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
import { rewriteAssetUrl } from '../utils/urlRewriter.js';

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
      this.updateDebugFlags();
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
    this.updateDebugFlags();
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
    const blackMask = this.createMaskPlaceholder();
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
   * Compute card size in pixels from PRINT plates
   * Uses cardPx from plates (v2 format), or falls back to rectPx/sizePx or DPI/MM
   */
  private computeCardSizePx(payload: ParserPayload): { widthPx: number; heightPx: number } {
    // v2 format: use cardPx from any plate (all plates should have same cardPx)
    const plateWithCardPx = payload.plates.find(p => p.cardPx);
    if (plateWithCardPx?.cardPx) {
      console.log(`[EngineBridge] Card size from cardPx: ${plateWithCardPx.cardPx.w}x${plateWithCardPx.cardPx.h} px`);
      return { widthPx: plateWithCardPx.cardPx.w, heightPx: plateWithCardPx.cardPx.h };
    }
    
    // Try to get size from PRINT plates (v1 format)
    const printPlates = payload.plates.filter(p => p.type === 'PRINT');
    
    if (printPlates.length > 0) {
      // Use the first PRINT plate's rectPx/sizePx (all PRINT plates should span full card)
      const firstPrint = printPlates[0];
      if (firstPrint.rectPx && firstPrint.sizePx) {
        // Card size = union of all PRINT plates (should be same, but take max to be safe)
        let maxX1 = 0;
        let maxY1 = 0;
        
        for (const plate of printPlates) {
          if (plate.rectPx) {
            maxX1 = Math.max(maxX1, plate.rectPx.x1);
            maxY1 = Math.max(maxY1, plate.rectPx.y1);
          }
        }
        
        if (maxX1 > 0 && maxY1 > 0) {
          console.log(`[EngineBridge] Card size from PRINT plates: ${maxX1}x${maxY1} px`);
          return { widthPx: maxX1, heightPx: maxY1 };
        }
      }
    }
    
    // Fallback: compute union of all plates
    let minX0 = Infinity;
    let minY0 = Infinity;
    let maxX1 = -Infinity;
    let maxY1 = -Infinity;
    
    for (const plate of payload.plates) {
      if (plate.rectPx) {
        minX0 = Math.min(minX0, plate.rectPx.x0);
        minY0 = Math.min(minY0, plate.rectPx.y0);
        maxX1 = Math.max(maxX1, plate.rectPx.x1);
        maxY1 = Math.max(maxY1, plate.rectPx.y1);
      }
    }
    
    if (maxX1 > 0 && maxY1 > 0) {
      const widthPx = maxX1 - minX0;
      const heightPx = maxY1 - minY0;
      console.log(`[EngineBridge] Card size from plate union: ${widthPx}x${heightPx} px`);
      return { widthPx, heightPx };
    }
    
    // Last resort: use DPI and card dimensions in mm
    if (payload.card) {
      const dpi = payload.dpi || payload.card.dpi || 600;
      const widthMm = payload.card.size.widthMm;
      const heightMm = payload.card.size.heightMm;
      const widthPx = Math.round((widthMm / 25.4) * dpi);
      const heightPx = Math.round((heightMm / 25.4) * dpi);
      
      console.log(`[EngineBridge] Card size from DPI/MM: ${widthPx}x${heightPx} px (${dpi} DPI, ${widthMm}x${heightMm}mm)`);
      return { widthPx, heightPx };
    }
    
    // Ultimate fallback: use defaults
    console.warn('[EngineBridge] Could not determine card size, using defaults');
    return { widthPx: 2100, heightPx: 1200 }; // ~88.9x50.8mm @ 600DPI
  }

  /**
   * Compute UV transform for a cropped texture
   * @param plate - Parser plate with positioning info (v2 format: startPx/endPx, v1 format: rectPx/sizePx)
   * @param cardWidthPx - Full card width in pixels
   * @param cardHeightPx - Full card height in pixels
   * @returns UV offset and scale
   * 
   * Card space: (0,0) = top-left, Y increases downward
   * UV space: (0,0) = bottom-left, Y increases upward
   * 
   * Transform: cardUV -> localUV = (cardUV - offset) / scale
   * where offset = (x0/cardW, 1.0 - y0/cardH) [flip Y]
   * and scale = (sizeW/cardW, sizeH/cardH)
   */
  private computeUvTransform(
    plate: ParserPlate | undefined,
    cardWidthPx: number,
    cardHeightPx: number
  ): { offset: THREE.Vector2; scale: THREE.Vector2 } {
    if (!plate || cardWidthPx <= 0 || cardHeightPx <= 0) {
      // No plate or invalid card size - use full card (no transform)
      return {
        offset: new THREE.Vector2(0.0, 0.0),
        scale: new THREE.Vector2(1.0, 1.0)
      };
    }
    
    // v2 format: use startPx/endPx
    if (plate.startPx && plate.endPx && plate.sizePx) {
      const x0 = plate.startPx.x;
      const y0 = plate.startPx.y;
      const w = plate.sizePx.w;
      const h = plate.sizePx.h;
      
      // UV offset = (x0 / cardWidth, 1.0 - y0 / cardHeight)
      const offset = new THREE.Vector2(
        x0 / cardWidthPx,
        1.0 - (y0 / cardHeightPx) // Flip Y: y0 is top in card space, maps to top in UV
      );
      
      // UV scale = (sizeW / cardWidth, sizeH / cardHeight)
      const scale = new THREE.Vector2(
        w / cardWidthPx,
        h / cardHeightPx
      );
      
      return { offset, scale };
    }
    
    // v1 format: use rectPx/sizePx
    if (plate.rectPx && plate.sizePx) {
      const x0 = plate.rectPx.x0;
      const y0 = plate.rectPx.y0;
      const w = plate.sizePx.w;
      const h = plate.sizePx.h;
      
      // UV offset = (x0 / cardWidth, 1.0 - y0 / cardHeight)
      const offset = new THREE.Vector2(
        x0 / cardWidthPx,
        1.0 - (y0 / cardHeightPx) // Flip Y: y0 is top in card space, maps to top in UV
      );
      
      // UV scale = (sizeW / cardWidth, sizeH / cardHeight)
      const scale = new THREE.Vector2(
        w / cardWidthPx,
        h / cardHeightPx
      );
      
      return { offset, scale };
    }
    
    // No positioning info - use full card (no transform)
    return {
      offset: new THREE.Vector2(0.0, 0.0),
      scale: new THREE.Vector2(1.0, 1.0)
    };
  }

  /**
   * Load textures from parser payload
   */
  private async loadTexturesFromParserPayload(payload: ParserPayload, state: ProoferState): Promise<void> {
    const currentSide = state.viewSide;
    
    // Compute card size in pixels (needed for UV transforms)
    const cardSize = this.computeCardSizePx(payload);

    // PRINT: stack/composite all print plates for each side, sorted by depthIndex
    await this.composeAndApplyPrint(payload, 'front', currentSide, cardSize);
    await this.composeAndApplyPrint(payload, 'back', currentSide, cardSize);

    // Masks: union/max across all depths (single-mask shader constraint)
    // Always compose for both sides - shader selects based on vFaceType
    await this.composeAndApplyMask(payload, 'FOIL_MASK', 'foil', 'front', currentSide, state, cardSize);
    await this.composeAndApplyMask(payload, 'FOIL_MASK', 'foil', 'back', currentSide, state, cardSize);

    await this.composeAndApplyMask(payload, 'SPOT_UV_MASK', 'uv', 'front', currentSide, state, cardSize);
    await this.composeAndApplyMask(payload, 'SPOT_UV_MASK', 'uv', 'back', currentSide, state, cardSize);

    await this.composeAndApplyEmboss(payload, 'front', currentSide, state, cardSize);
    await this.composeAndApplyEmboss(payload, 'back', currentSide, state, cardSize);

    // Die-cut: prefer mask plates; SVG is preserved in meta but not used by current shader pipeline
    // Apply to both sides when enabled
    if (state.optionStates.diecut.enabled) {
      await this.composeAndApplyMask(payload, 'DIECUT_MASK', 'diecut', 'front', currentSide, state, cardSize);
      await this.composeAndApplyMask(payload, 'DIECUT_MASK', 'diecut', 'back', currentSide, state, cardSize);
    } else {
      // Disable diecut on both sides with black mask
      const blackMask = this.createMaskPlaceholder();
      this.updateMaterialTexture('diecut', blackMask, 'front');
      this.updateMaterialTexture('diecut', blackMask, 'back');
      // Reset UV transform to full card (no cropping)
      this.updateMaskUvTransform('diecut', new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
    }
  }

  private getPlatesSorted(payload: ParserPayload, side: 'front' | 'back', type: string): ParserPlate[] {
    return payload.plates
      .filter(p => (p.face ?? p.side) === side && p.type === (type as any))
      .slice()
      .sort((a, b) => (a.depthIndex ?? 0) - (b.depthIndex ?? 0) || a.id.localeCompare(b.id));
  }

  private async composeAndApplyPrint(
    payload: ParserPayload,
    side: 'front' | 'back',
    _currentSide: 'front' | 'back',
    cardSize: { widthPx: number; heightPx: number }
  ): Promise<void> {
    // Use file field if available, otherwise fall back to assets.png
    const printPlates = this.getPlatesSorted(payload, side, 'PRINT').filter(p => {
      // New format: use file field
      if (p.file) return true;
      // Legacy format: use assets.png
      return !!p.assets.png;
    });
    
    if (printPlates.length === 0) {
      console.log(`[EngineBridge] No PRINT plates found for side: ${side}`);
      return;
    }

    // Build URLs: prefer file field, fall back to assets.png
    const urls = printPlates.map(p => {
      if (p.file) {
        // file might be a full URL or relative path
        if (p.file.startsWith('http://') || p.file.startsWith('https://')) {
          // Rewrite HTTP URLs to use proxy in production
          return rewriteAssetUrl(p.file);
        }
        // Relative path: construct full URL then rewrite if needed
        const isProduction = window.location.protocol === 'https:';
        const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
        const useProxy = isProduction && (!envBaseUrl || envBaseUrl.startsWith('http://'));
        
        if (useProxy) {
          return `/api/parser-proxy/output/${p.file}`;
        } else {
          const baseUrl = envBaseUrl || 'http://localhost:8080';
          const fullUrl = `${baseUrl}/output/${p.file}`;
          return rewriteAssetUrl(fullUrl);
        }
      }
      // Rewrite assets.png URL if it's a full HTTP URL
      return rewriteAssetUrl(p.assets.png!);
    });
    
    console.log(`[EngineBridge] Composing print for ${side}:`, urls.length, 'layers');
    const composed = await this.getOrComposeStackedTexture(`print:${side}`, urls, 'stack', cardSize, printPlates);
    console.log(`[EngineBridge] Composed texture UUID for ${side}:`, composed?.uuid);

    // PRINT textures are full-card size, so no UV transform needed (offset=0,0, scale=1,1)
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
    state: ProoferState,
    cardSize: { widthPx: number; heightPx: number }
  ): Promise<void> {
    // Use file field if available, otherwise fall back to assets.maskPng
    const plates = this.getPlatesSorted(payload, side, plateType).filter(p => {
      // New format: use file field
      if (p.file) return true;
      // Legacy format: use assets.maskPng
      return !!p.assets.maskPng;
    });
    
    const optionState =
      target === 'foil' ? state.optionStates.foil :
      target === 'uv' ? state.optionStates.uv :
      state.optionStates.diecut;

    // If no parser masks exist for this effect/side, use black placeholder (no effect)
    // DO NOT fall back to demo masks - parser is source of truth
    if (plates.length === 0) {
      // Only apply black placeholder on front (finishes are front-only for now)
      if (optionState.enabled && side === 'front') {
        console.log(`[EngineBridge] No ${target} parser mask found for ${side}, using black placeholder (no effect)`);
        const blackMask = this.createMaskPlaceholder();
        this.updateMaterialTexture(target, blackMask, side);
        // Reset UV transform to full card (no cropping)
        this.updateMaskUvTransform(target, new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
      }
      return;
    }

    // Build URLs: prefer file field, fall back to assets.maskPng
    const urls = plates.map(p => {
      if (p.file) {
        // file might be a full URL or relative path
        if (p.file.startsWith('http://') || p.file.startsWith('https://')) {
          // Rewrite HTTP URLs to use proxy in production
          return rewriteAssetUrl(p.file);
        }
        // Relative path: construct full URL then rewrite if needed
        const isProduction = window.location.protocol === 'https:';
        const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
        const useProxy = isProduction && (!envBaseUrl || envBaseUrl.startsWith('http://'));
        
        if (useProxy) {
          return `/api/parser-proxy/output/${p.file}`;
        } else {
          const baseUrl = envBaseUrl || 'http://localhost:8080';
          const fullUrl = `${baseUrl}/output/${p.file}`;
          return rewriteAssetUrl(fullUrl);
        }
      }
      // Rewrite assets.maskPng URL if it's a full HTTP URL
      return rewriteAssetUrl(p.assets.maskPng!);
    });
    
    console.log(`[EngineBridge] Composing ${target} parser mask for ${side}:`, urls.length, 'layers');
    const composed = await this.getOrComposeStackedTexture(`mask:${plateType}:${side}`, urls, 'max', cardSize, plates);
    console.log(`[EngineBridge] Composed ${target} parser mask UUID for ${side}:`, composed?.uuid);

    // Compute UV transform from first plate's positioning info
    // All plates of same type/side should have same positioning (union is done in composition)
    const firstPlate = plates[0];
    const uvTransform = this.computeUvTransform(
      firstPlate,
      cardSize.widthPx,
      cardSize.heightPx
    );
    
    console.log(`[EngineBridge] ${target} UV transform for ${side}:`, {
      offset: uvTransform.offset,
      scale: uvTransform.scale,
      startPx: firstPlate.startPx,
      endPx: firstPlate.endPx,
      rectPx: firstPlate.rectPx,
      sizePx: firstPlate.sizePx
    });

    // Apply parser mask when enabled on the front face (back masks can be added later)
    if (optionState.enabled && side === 'front') {
      console.log(`[EngineBridge] Applying ${target} parser mask for enabled side: ${side}`);
      this.updateMaterialTexture(target, composed, side);
      this.updateMaskUvTransform(target, uvTransform.offset, uvTransform.scale);
    }
  }

  private async composeAndApplyEmboss(
    payload: ParserPayload,
    side: 'front' | 'back',
    _currentSide: 'front' | 'back', // Not used - masks applied based on optionState.side
    state: ProoferState,
    cardSize: { widthPx: number; heightPx: number }
  ): Promise<void> {
    const plates = this.getPlatesSorted(payload, side, 'EMBOSS');
    
    // If no parser emboss maps exist for this side, use black placeholder (no effect)
    // DO NOT fall back to demo masks - parser is source of truth
    if (plates.length === 0) {
      if (state.optionStates.emboss.enabled && side === 'front') {
        console.log(`[EngineBridge] No emboss map found for ${side}, using black placeholder (effect disabled)`);
        const blackMask = this.createMaskPlaceholder();
        this.updateMaterialTexture('emboss', blackMask, side);
        // Reset UV transform to full card (no cropping)
        this.updateMaskUvTransform('emboss', new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
      }
      return;
    }

    // Prefer height maps if present; otherwise merge masks.
    // Use file field if available, otherwise fall back to assets
    const heightUrls: string[] = [];
    const maskUrls: string[] = [];
    const baseUrl = import.meta.env.VITE_PARSER_BASE_URL || 'http://localhost:8080';
    
    const isProduction = window.location.protocol === 'https:';
    const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
    const useProxy = isProduction && (!envBaseUrl || envBaseUrl.startsWith('http://'));
    
    for (const plate of plates) {
      if (plate.file) {
        // New format: use file field (assume it's a height map if type is EMBOSS)
        let url: string;
        if (plate.file.startsWith('http://') || plate.file.startsWith('https://')) {
          // Rewrite HTTP URLs to use proxy in production
          url = rewriteAssetUrl(plate.file);
        } else {
          // Relative path: use proxy in production, direct URL in development
          if (useProxy) {
            url = `/api/parser-proxy/output/${plate.file}`;
          } else {
            const baseUrl = envBaseUrl || 'http://localhost:8080';
            const fullUrl = `${baseUrl}/output/${plate.file}`;
            url = rewriteAssetUrl(fullUrl);
          }
        }
        heightUrls.push(url);
      } else {
        // Legacy format: use assets - rewrite URLs if needed
        if (plate.assets.heightPng) heightUrls.push(rewriteAssetUrl(plate.assets.heightPng));
        if (plate.assets.maskPng) maskUrls.push(rewriteAssetUrl(plate.assets.maskPng));
      }
    }
    
    const urls = heightUrls.length > 0 ? heightUrls : maskUrls;
    if (urls.length === 0) {
      if (state.optionStates.emboss.enabled && state.optionStates.emboss.side === side) {
        console.log(`[EngineBridge] No emboss assets found for ${side}, using black placeholder`);
        const blackMask = this.createMaskPlaceholder();
        this.updateMaterialTexture('emboss', blackMask, side);
        // Reset UV transform to full card (no cropping)
        this.updateMaskUvTransform('emboss', new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
      }
      return;
    }

    console.log(`[EngineBridge] Composing emboss for ${side}:`, urls.length, 'layers', heightUrls.length > 0 ? '(height maps)' : '(masks)');
    const composed = await this.getOrComposeStackedTexture(`emboss:${side}:${heightUrls.length > 0 ? 'height' : 'mask'}`, urls, 'max', cardSize, plates);
    console.log(`[EngineBridge] Composed emboss UUID for ${side}:`, composed?.uuid);

    // Compute UV transform from first plate's positioning info
    const firstPlate = plates[0];
    const uvTransform = this.computeUvTransform(
      firstPlate,
      cardSize.widthPx,
      cardSize.heightPx
    );
    
    console.log(`[EngineBridge] emboss UV transform for ${side}:`, {
      offset: uvTransform.offset,
      scale: uvTransform.scale,
      startPx: firstPlate.startPx,
      endPx: firstPlate.endPx,
      rectPx: firstPlate.rectPx,
      sizePx: firstPlate.sizePx
    });

    // Always apply parser emboss maps when enabled and side matches
    // Shader will use correct texture based on vFaceType
    if (state.optionStates.emboss.enabled && side === 'front') {
      this.updateMaterialTexture('emboss', composed, side);
      this.updateMaskUvTransform('emboss', uvTransform.offset, uvTransform.scale);
    }
  }

  private async getOrComposeStackedTexture(
    cacheKey: string,
    urls: string[],
    mode: 'stack' | 'max',
    cardSize?: { widthPx: number; heightPx: number },
    plates?: ParserPlate[]
  ): Promise<THREE.Texture> {
    const signature = `${cacheKey}::${urls.join('|')}`;
    const cached = this.composedTextures.get(signature);
    if (cached) return cached;

    // Load all source textures first (in stable order)
    const textures = await Promise.all(
      urls.map((u) => (mode === 'max' ? ResourceManager.loadMask(u) : ResourceManager.loadTexture(u)))
    );
    const images = textures.map(t => t.image as any).filter(Boolean);
    if (images.length === 0) {
      // Fallback: black (no effect)
      return mode === 'max'
        ? this.createMaskPlaceholder()
        : ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
    }

    // Determine canvas size: use cardPx if available, otherwise use first image size
    let canvasW: number;
    let canvasH: number;
    let usePositioning = false;

    if (cardSize && plates && plates.length > 0 && plates[0].cardPx) {
      // v2 format: use cardPx for canvas size and position textures
      canvasW = cardSize.widthPx;
      canvasH = cardSize.heightPx;
      usePositioning = true;
      console.log(`[EngineBridge] Using cardPx canvas: ${canvasW}x${canvasH}px with positioning`);
    } else {
      // v1 format: use first image size (legacy behavior)
      canvasW = images[0].width || images[0].naturalWidth;
      canvasH = images[0].height || images[0].naturalHeight;
      usePositioning = false;
      console.log(`[EngineBridge] Using image-size canvas: ${canvasW}x${canvasH}px (no positioning)`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d', { willReadFrequently: mode === 'max' })!;

    if (usePositioning && plates) {
      // v2 format: position each texture at its startPx
      if (mode === 'stack') {
        // Stack mode: draw each image at its position
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const plate = plates[i];
          if (plate?.startPx) {
            const x = plate.startPx.x;
            const y = plate.startPx.y;
            const imgW = img.width || img.naturalWidth;
            const imgH = img.height || img.naturalHeight;
            ctx.drawImage(img, x, y, imgW, imgH);
            console.log(`[EngineBridge] Stacked image ${i} at (${x}, ${y}) size ${imgW}x${imgH}`);
          } else {
            // Fallback: draw at (0,0) if no positioning info
            ctx.drawImage(img, 0, 0, canvasW, canvasH);
          }
        }
      } else {
        // Max mode: union/max per-channel, positioned
        const accum = new Uint8ClampedArray(canvasW * canvasH * 4);
        
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const plate = plates[i];
          
          if (plate?.startPx) {
            const x = plate.startPx.x;
            const y = plate.startPx.y;
            const imgW = img.width || img.naturalWidth;
            const imgH = img.height || img.naturalHeight;
            
            // Draw image to temp canvas to get pixel data
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imgW;
            tempCanvas.height = imgH;
            const tempCtx = tempCanvas.getContext('2d')!;
            tempCtx.drawImage(img, 0, 0, imgW, imgH);
            const imgData = tempCtx.getImageData(0, 0, imgW, imgH).data;
            
            // Accumulate into main canvas at position
            for (let py = 0; py < imgH; py++) {
              for (let px = 0; px < imgW; px++) {
                const srcIdx = (py * imgW + px) * 4;
                const dstX = x + px;
                const dstY = y + py;
                if (dstX >= 0 && dstX < canvasW && dstY >= 0 && dstY < canvasH) {
                  const dstIdx = (dstY * canvasW + dstX) * 4;
                  for (let c = 0; c < 4; c++) {
                    if (imgData[srcIdx + c] > accum[dstIdx + c]) {
                      accum[dstIdx + c] = imgData[srcIdx + c];
                    }
                  }
                }
              }
            }
            console.log(`[EngineBridge] Max-accumulated image ${i} at (${x}, ${y}) size ${imgW}x${imgH}`);
          } else {
            // Fallback: draw at (0,0) and max-accumulate
            ctx.clearRect(0, 0, canvasW, canvasH);
            ctx.drawImage(img, 0, 0, canvasW, canvasH);
            const data = ctx.getImageData(0, 0, canvasW, canvasH).data;
            for (let i = 0; i < accum.length; i++) {
              if (data[i] > accum[i]) accum[i] = data[i];
            }
          }
        }
        
        const out = ctx.createImageData(canvasW, canvasH);
        out.data.set(accum);
        ctx.putImageData(out, 0, 0);
      }
    } else {
      // v1 format: legacy behavior (draw all at 0,0)
      const w = images[0].width || images[0].naturalWidth;
      const h = images[0].height || images[0].naturalHeight;

      if (mode === 'stack') {
        for (const img of images) {
          ctx.drawImage(img, 0, 0, w, h);
        }
      } else {
        // Union/max per-channel across all layers.
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
    }

    const outTex = new THREE.CanvasTexture(canvas);
    outTex.flipY = false;
    outTex.colorSpace = mode === 'max' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (mode === 'max') {
      outTex.generateMipmaps = false;
      outTex.minFilter = THREE.LinearFilter;
      outTex.magFilter = THREE.LinearFilter;
    }
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
      const isMask = type !== 'artwork';
      const texture = isMask
        ? await ResourceManager.loadMask(url)
        : await ResourceManager.loadTexture(url);
      
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
      const placeholder = type === 'artwork'
        ? ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5))
        : this.createMaskPlaceholder();
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
   * Update UV transform for a mask type
   */
  private updateMaskUvTransform(
    type: 'foil' | 'uv' | 'emboss' | 'diecut',
    offset: THREE.Vector2,
    scale: THREE.Vector2
  ): void {
    switch (type) {
      case 'foil':
        MaterialPipeline.updateFoilUvTransform(this.material, offset, scale);
        break;
      case 'uv':
        MaterialPipeline.updateUvUvTransform(this.material, offset, scale);
        break;
      case 'emboss':
        MaterialPipeline.updateEmbossUvTransform(this.material, offset, scale);
        break;
      case 'diecut':
        MaterialPipeline.updateDieCutUvTransform(this.material, offset, scale);
        break;
    }
  }

  private createMaskPlaceholder(): THREE.Texture {
    const tex = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0), THREE.NoColorSpace);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  private updateDebugFlags(): void {
    const debugFlags = (window as any).__PROOFER_DEBUG__ || {};
    MaterialPipeline.updateDebugFlags(this.material, {
      showFaceId: !!debugFlags.showFaceId,
      showPrintOnly: !!debugFlags.showPrintOnly,
      showFoilOnly: !!debugFlags.showFoilOnly
    });
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
        const defaultMask = this.createMaskPlaceholder();
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

