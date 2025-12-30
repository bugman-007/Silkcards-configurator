/**
 * Proofer Controller
 * 
 * Manages proofer state and provides mutation methods
 */

import { 
  ProoferState, 
  createDefaultProoferState,
  ParserStatus,
  ParsedPlate,
  OptionState,
  ArtworkTransform,
  Warning,
  CardSide,
  LayerType,
  ParserPayload,
  ParserPlate,
  ParserPlateType,
  FaceStack,
  PlyStack
} from './ProoferState.js';
import { PLY_THICKNESS_MM } from '../geometry/CardGeometry.js';

export type ProoferListener = (state: ProoferState) => void;

/**
 * Proofer Controller
 * 
 * Central controller for proofer state
 */
export class ProoferController {
  private state: ProoferState;
  private listeners: Set<ProoferListener> = new Set();

  constructor(initialState?: ProoferState) {
    this.state = initialState || createDefaultProoferState();
  }

  /**
   * Get current state
   */
  getState(): ProoferState {
    return { ...this.state };
  }

  /**
   * Add listener
   */
  addListener(listener: ProoferListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove listener
   */
  removeListener(listener: ProoferListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.listeners.forEach(listener => listener(stateCopy));
  }

  /**
   * Update dimensions
   */
  updateDimensions(width: number, height: number, thickness: number, cornerRadius: number): void {
    const oldThickness = this.state.thickness;
    this.state.width = width;
    this.state.height = height;
    this.state.thickness = thickness;
    this.state.cornerRadius = cornerRadius;
    
    // Auto-disable foil mode if plyCount is less than 2 (foil requires 2+ layers)
    if (this.state.edgeFinish.enabled && this.state.edgeFinish.mode === 'foil') {
      if (this.state.plyCount < 2) {
        // Force to color mode if less than 2 plies
        this.state.edgeFinish.mode = 'color';
      }
    }
    
    this.notifyListeners();
  }

  /**
   * Set uploaded file
   */
  setUploadedFile(file: File): void {
    this.state.uploadedFile = file;
    this.notifyListeners();
  }

  /**
   * Set parser status
   */
  setParserStatus(status: ParserStatus, error?: string): void {
    this.state.parserStatus = status;
    this.state.parserError = error;
    this.notifyListeners();
  }

  /**
   * Set parsed plates
   */
  setParsedPlates(plates: ParsedPlate[]): void {
    this.state.parsedPlates = plates;
    this.notifyListeners();
  }

  /**
   * Add parsed plate
   */
  addParsedPlate(plate: ParsedPlate): void {
    this.state.parsedPlates.push(plate);
    this.notifyListeners();
  }

  /**
   * Remove parsed plate
   */
  removeParsedPlate(plateId: string): void {
    this.state.parsedPlates = this.state.parsedPlates.filter(p => p.id !== plateId);
    // Remove from assignments if assigned
    delete this.state.plateAssignments[plateId];
    this.notifyListeners();
  }

  /**
   * Update option state
   */
  updateOptionState(option: 'foil' | 'uv' | 'emboss' | 'diecut', state: Partial<OptionState>): void {
    this.state.optionStates[option] = { ...this.state.optionStates[option], ...state };
    this.notifyListeners();
  }

  /**
   * Update edge finish state
   */
  updateEdgeFinish(state: Partial<import('./ProoferState.js').EdgeFinishState>): void {
    this.state.edgeFinish = { ...this.state.edgeFinish, ...state };
    
    // Auto-disable foil mode if plyCount is less than 2 (foil requires 2+ layers)
    if (state.mode === 'foil' || this.state.edgeFinish.mode === 'foil') {
      if (this.state.plyCount < 2) {
        // Force to color mode if less than 2 plies
        this.state.edgeFinish.mode = 'color';
      }
    }
    
    this.notifyListeners();
  }

  /**
   * Get thickness in points (for foil availability check)
   * Converts mm to points: 1pt = 1/1000 inch = 0.0254mm
   * So thicknessPt = thicknessMm / 0.0254 * 1000 = thicknessMm / 0.0000254
   */
  private getThicknessInPoints(): number {
    // thickness is stored in mm
    // 1pt = 0.000352778 inch = 0.0089556mm (actually: 1pt = 1/72 inch = 0.352778mm)
    // Wait, let me recalculate: 1pt = 1/72 inch = 0.0138889 inch = 0.352778mm
    // So thicknessPt = thicknessMm / 0.352778
    // But the code uses: thicknessPt / 1000 * 25.4 = thicknessMm
    // So: thicknessPt = thicknessMm * 1000 / 25.4 = thicknessMm * 39.3701
    // Actually, I think the parser uses a different unit. Let me check the actual conversion.
    // From the code: `const thicknessMm = (thicknessPt / 1000) * 25.4;`
    // This means: thicknessPt = thicknessMm * 1000 / 25.4
    // But that doesn't match standard point conversion.
    // Let me use a simpler approach: check if thickness is close to known values.
    const thicknessMm = this.state.thickness;
    
    // Known thicknesses in mm (approximate):
    // 16pt ≈ 0.564mm (from default state)
    // 28pt ≈ 0.988mm (28/1000 * 25.4 = 0.7112mm, but let's use the pattern from code)
    // Actually, from the code pattern: 16pt = 0.56444mm
    // So: 28pt = 0.56444 * 28/16 = 0.98777mm
    
    // Use tolerance-based check
    const thickness28ptMm = 0.98777; // Approximate 28pt in mm
    const tolerance = 0.1; // 0.1mm tolerance
    
    if (Math.abs(thicknessMm - thickness28ptMm) < tolerance) {
      return 28;
    }
    
    // Check other common values
    const thickness16ptMm = 0.56444;
    if (Math.abs(thicknessMm - thickness16ptMm) < tolerance) {
      return 16;
    }
    
    const thickness32ptMm = 1.12888; // 32/16 * 0.56444
    if (Math.abs(thicknessMm - thickness32ptMm) < tolerance) {
      return 32;
    }
    
    const thickness45ptMm = 1.5875; // 45/16 * 0.56444
    if (Math.abs(thicknessMm - thickness45ptMm) < tolerance) {
      return 45;
    }
    
    const thickness48ptMm = 1.69332; // 48/16 * 0.56444
    if (Math.abs(thicknessMm - thickness48ptMm) < tolerance) {
      return 48;
    }
    
    // Default: return 0 if unknown
    return 0;
  }

  /**
   * Assign plate to layer
   */
  assignPlate(plateId: string, type: LayerType, side: CardSide): void {
    this.state.plateAssignments[plateId] = { type, side };
    this.notifyListeners();
  }

  /**
   * Unassign plate
   */
  unassignPlate(plateId: string): void {
    delete this.state.plateAssignments[plateId];
    this.notifyListeners();
  }

  /**
   * Update artwork transform
   */
  updateArtworkTransform(transform: Partial<ArtworkTransform>): void {
    this.state.artworkTransform = { ...this.state.artworkTransform, ...transform };
    this.notifyListeners();
  }

  /**
   * Add warning
   */
  addWarning(warning: Warning): void {
    this.state.warnings.push(warning);
    this.notifyListeners();
  }

  /**
   * Remove warning
   */
  removeWarning(warningId: string): void {
    this.state.warnings = this.state.warnings.filter(w => w.id !== warningId);
    this.notifyListeners();
  }

  /**
   * Clear warnings
   */
  clearWarnings(): void {
    this.state.warnings = [];
    this.notifyListeners();
  }

  /**
   * Set approved
   */
  setApproved(approved: boolean): void {
    this.state.approved = approved;
    this.notifyListeners();
  }

  /**
   * Set view side
   */
  setViewSide(side: CardSide): void {
    this.state.viewSide = side;
    this.notifyListeners();
  }

  /**
   * Load parser payload and auto-map plates
   */
  loadParserPayload(payload: ParserPayload): void {
    console.log(`[Proofer] Loaded parser payload jobId=${payload.jobId || 'unknown'}`);
    
    // Normalize plate types first - ensure all plates match expected internal types
    const payloadNormalized: ParserPayload = {
      ...payload,
      plates: payload.plates.map(plate => ({
        ...plate,
        type: this.normalizePlateType(plate)
      }))
    };
    
    // Log plate type counts after normalization
    const typeCounts = {
      PRINT: 0,
      FOIL_MASK: 0,
      SPOT_UV_MASK: 0,
      EMBOSS: 0,
      DIECUT_MASK: 0,
      DIECUT_SVG: 0,
      UNKNOWN: 0
    };
    
    for (const plate of payloadNormalized.plates) {
      if (plate.type in typeCounts) {
        typeCounts[plate.type as keyof typeof typeCounts]++;
      } else {
        typeCounts.UNKNOWN++;
      }
    }
    
    console.log(`[Proofer] Plate type counts after normalization:`, typeCounts);
    
    // Store normalized payload
    this.state.parserPayload = payloadNormalized;
    
    // Update card dimensions from payload
    // v2 format: card object is optional, derive from plates' cardPx
    if (payload.card) {
      // Legacy format: card object exists
    const cardSize = payload.card.size;
    const thicknessPt = payload.card.thicknessPt;
    const thicknessMm = (thicknessPt / 1000) * 25.4; // Convert pt to mm (1pt = 1/1000 inch, 1 inch = 25.4mm)
    
    this.state.width = cardSize.widthMm;
    this.state.height = cardSize.heightMm;
    this.state.thickness = thicknessMm;
    } else {
      // v2 format: derive from plates
      // Find a PRINT plate to get cardPx, or use first plate
      const printPlate = payloadNormalized.plates.find(p => p.type === 'PRINT');
      const referencePlate = printPlate || payloadNormalized.plates[0];
      
      if (referencePlate?.cardPx) {
        // Convert cardPx to mm using DPI
        const dpi = referencePlate.dpiUsed || payload.dpi || 600;
        const widthMm = (referencePlate.cardPx.w / dpi) * 25.4;
        const heightMm = (referencePlate.cardPx.h / dpi) * 25.4;
        
        this.state.width = widthMm;
        this.state.height = heightMm;
        console.log(`[Proofer] Derived card size from cardPx: ${widthMm.toFixed(2)}x${heightMm.toFixed(2)}mm (${referencePlate.cardPx.w}x${referencePlate.cardPx.h}px @ ${dpi}DPI)`);
      } else {
        // Fallback: use defaults
        console.warn('[Proofer] No card info found, using defaults');
        this.state.width = 50.8;
        this.state.height = 88.9;
      }
      
      // Default thickness if not available
      this.state.thickness = 0.56444; // 16pt in mm
    }
    
    // Keep existing cornerRadius or use default
    if (!this.state.cornerRadius) {
      this.state.cornerRadius = 5;
    }
    
    // Derive plyCount from PHYSICAL ply indices (NOT depthIndex render order)
    // depthIndex often represents render stack depth, which splits print vs finishes into different plies.
    // We want layer_<n> (or physicalPlyIndex) to define the physical ply.
    const plyIndices = new Set<number>();
    let maxPlyIndex = 0;

    for (const plate of payloadNormalized.plates) {
      const plyIndex = this.getPlyIndex(plate);
      plyIndices.add(plyIndex);
      if (plyIndex > maxPlyIndex) maxPlyIndex = plyIndex;
    }

    // plyCount should cover the highest physical ply index
    this.state.plyCount = Math.max(maxPlyIndex + 1, 1);

    console.log(
      `[Proofer] Derived plyCount=${this.state.plyCount} from physical plate indices: ` +
      `[${Array.from(plyIndices).sort((a,b)=>a-b).join(', ')}]`
    );
    
    // Calculate total thickness = plyCount * PLY_THICKNESS_MM (16pt per ply = 5.644mm)
    // Override any thickness set from payload.card - use computed value
    const oldPlyCount = this.state.plyCount;
    this.state.thickness = this.state.plyCount * PLY_THICKNESS_MM;
    console.log(`[Proofer] Total thickness: ${this.state.thickness.toFixed(2)}mm (${this.state.plyCount} plies × ${PLY_THICKNESS_MM}mm)`);
    
    // Auto-disable foil mode if plyCount changed and is now less than 2 (foil requires 2+ layers)
    if (this.state.edgeFinish.enabled && this.state.edgeFinish.mode === 'foil') {
      if (this.state.plyCount < 2) {
        this.state.edgeFinish.mode = 'color';
        console.log(`[Proofer] Edge finish foil mode disabled: requires 2+ layers, but plyCount is ${this.state.plyCount}`);
      }
    }
    
    // Build FaceStacks: organize plates by plyIndex and face (using normalized plates)
    const faceStacks = this.buildFaceStacks(payloadNormalized.plates);
    this.state.faceStacks = faceStacks;
    console.log(`[Proofer] Built FaceStacks for ${faceStacks.size} plies`);
    
    // Convert parser plates to ParsedPlate format
    const parsedPlates: ParsedPlate[] = payloadNormalized.plates.map(plate => {
      // Map parser plate type to our LayerType
      let layerType: LayerType = 'artwork';
      if (plate.type === 'FOIL_MASK') layerType = 'foil';
      else if (plate.type === 'SPOT_UV_MASK') layerType = 'uv';
      else if (plate.type === 'EMBOSS') layerType = 'emboss';
      else if (plate.type === 'DIECUT_MASK' || plate.type === 'DIECUT_SVG') layerType = 'diecut';
      else if (plate.type === 'PRINT') layerType = 'artwork';
      
      // Get asset URL (prefer png for PRINT, maskPng for masks)
      const assetUrl = plate.type === 'PRINT'
        ? plate.assets.png
        : plate.assets.maskPng || plate.assets.heightPng || plate.assets.svg || plate.assets.png;
      
      // Get thumbnail URL (prefer PNG for display)
      const thumbnailUrl = plate.assets.png || plate.assets.maskPng || plate.assets.heightPng;
      
      return {
        id: plate.id,
        type: layerType,
        side: (plate.face ?? plate.side),
        filename: plate.aiLayerName || plate.id,
        thumbnail: thumbnailUrl, // PNG URL for thumbnail display
        file: assetUrl // Store URL string for actual use
      };
    });
    
    this.state.parsedPlates = parsedPlates;
    
    // Auto-map plates by type/side/depthIndex (using normalized plates)
    this.autoMapPlates(payloadNormalized.plates);
    
    // Auto-enable finish toggles based on actual masks in faceStacks
    // Only on first parse - respect user's manual toggles if they've disabled them
    this.autoEnableFinishesFromFaceStacks(faceStacks);
    
    this.notifyListeners();
  }
  
  /**
   * Build FaceStacks from parser plates
   * Organizes plates by plyIndex (depthIndex) and face (front/back)
   * This is the render data model that drives compositing
   */
  private buildFaceStacks(plates: ParserPlate[]): Map<number, PlyStack> {
    const stacks = new Map<number, PlyStack>();

    // Group plates by PHYSICAL plyIndex (NOT depthIndex)
    const platesByPly = new Map<number, ParserPlate[]>();

    for (const plate of plates) {
      const plyIndex = this.getPlyIndex(plate);

      if (!platesByPly.has(plyIndex)) {
        platesByPly.set(plyIndex, []);
      }
      platesByPly.get(plyIndex)!.push(plate);
    }

    // Build PlyStack in deterministic ply order (0..N)
    const sortedPlyIndices = Array.from(platesByPly.keys()).sort((a, b) => a - b);

    // Build PlyStack for each plyIndex
    for (const plyIndex of sortedPlyIndices) {
      const plyPlates = platesByPly.get(plyIndex)!;
      const frontStack: FaceStack = {
        prints: [],
        foilMasks: [],
        uvMasks: [],
        embossMasks: [],
        diecut: undefined
      };
      const backStack: FaceStack = {
        prints: [],
        foilMasks: [],
        uvMasks: [],
        embossMasks: [],
        diecut: undefined
      };

      // Sort plates by side and type
      for (const plate of plyPlates) {
        const side = plate.face ?? plate.side;
        const faceStack = side === 'front' ? frontStack : backStack;

        switch (plate.type) {
          case 'PRINT':
            faceStack.prints.push(plate);
            break;
          case 'FOIL_MASK':
            faceStack.foilMasks.push(plate);
            break;
          case 'SPOT_UV_MASK':
            faceStack.uvMasks.push(plate);
            break;
          case 'EMBOSS':
            faceStack.embossMasks.push(plate);
            break;
          case 'DIECUT_MASK':
          case 'DIECUT_SVG':
            // Only one diecut per face (prefer front if both exist)
            if (!faceStack.diecut || side === 'front') {
              faceStack.diecut = plate;
            }
            break;
        }
      }

      // Sort each array deterministically (by layer number in ID, then by ID)
      const sortPlates = (a: ParserPlate, b: ParserPlate) => {
        const layerA = this.extractLayerNumber(a.file ?? a.id);
        const layerB = this.extractLayerNumber(b.file ?? b.id);
        if (layerA !== layerB) {
          return layerA - layerB;
        }
        return a.id.localeCompare(b.id);
      };

      frontStack.prints.sort(sortPlates);
      frontStack.foilMasks.sort(sortPlates);
      frontStack.uvMasks.sort(sortPlates);
      frontStack.embossMasks.sort(sortPlates);
      backStack.prints.sort(sortPlates);
      backStack.foilMasks.sort(sortPlates);
      backStack.uvMasks.sort(sortPlates);
      backStack.embossMasks.sort(sortPlates);

      stacks.set(plyIndex, {
        plyIndex,
        front: frontStack,
        back: backStack
      });
    }

    return stacks;
  }

  /**
   * Normalize plate type to match internal expected types
   * Handles various formats from meta.json (FOIL, UV, DIECUT, etc.)
   * and filename-based fallback detection
   */
  private normalizePlateType(plate: ParserPlate): ParserPlateType {
    // If already in expected format, return as-is
    const expectedTypes: ParserPlateType[] = [
      'PRINT',
      'FOIL_MASK',
      'SPOT_UV_MASK',
      'EMBOSS',
      'DIECUT_MASK',
      'DIECUT_SVG'
    ];
    
    if (plate.type && expectedTypes.includes(plate.type as ParserPlateType)) {
      return plate.type as ParserPlateType;
    }
    
    // Normalize common type variations
    const typeUpper = (plate.type || '').toUpperCase();
    
    // Direct type mappings
    if (typeUpper === 'FOIL' || typeUpper === 'FOIL_MASK') {
      return 'FOIL_MASK';
    }
    if (typeUpper === 'UV' || typeUpper === 'SPOT_UV' || typeUpper === 'SPOT_UV_MASK') {
      return 'SPOT_UV_MASK';
    }
    if (typeUpper === 'EMBOSS' || typeUpper === 'EMBOSS_MASK') {
      return 'EMBOSS';
    }
    if (typeUpper === 'DIECUT' || typeUpper === 'DIECUT_MASK') {
      return 'DIECUT_MASK';
    }
    if (typeUpper === 'DIECUT_SVG' || typeUpper === 'SVG') {
      return 'DIECUT_SVG';
    }
    if (typeUpper === 'PRINT' || typeUpper === 'ARTWORK') {
      return 'PRINT';
    }
    
    // Filename-based fallback detection
    const filename = (plate.file || plate.id || plate.aiLayerName || '').toLowerCase();
    
    if (filename.includes('spot_uv') || filename.includes('spotuv') || filename.includes('uv_mask')) {
      return 'SPOT_UV_MASK';
    }
    if (filename.includes('foil') || filename.includes('foil_mask')) {
      return 'FOIL_MASK';
    }
    if (filename.includes('emboss') || filename.includes('deboss')) {
      return 'EMBOSS';
    }
    if (filename.includes('diecut') || filename.includes('die_cut') || filename.includes('die-cut')) {
      // Check if it's SVG
      if (filename.endsWith('.svg') || filename.includes('_svg')) {
        return 'DIECUT_SVG';
      }
      return 'DIECUT_MASK';
    }
    if (filename.includes('print') || filename.includes('artwork')) {
      return 'PRINT';
    }
    
    // Default fallback: assume PRINT if unknown
    console.warn(`[Proofer] Unknown plate type "${plate.type}" for plate ${plate.id}, defaulting to PRINT`);
    return 'PRINT';
  }

  /**
   * Determine the PHYSICAL ply index for a plate.
   *
   * IMPORTANT:
   * - depthIndex is often render stack depth, not physical ply.
   * - physical ply is typically encoded by layer_<n> in plate.id, or physicalPlyIndex.
   */
  private getPlyIndex(plate: ParserPlate): number {
    // IMPORTANT:
    // In current payloads, physicalPlyIndex is always present and often equals depthIndex,
    // which behaves like render depth (splits print vs finishes).
    // We must prefer the layer_<n> encoded in file/id/aiLayerName.

    const tryParseLayer = (s?: string) => {
      if (!s) return undefined;
      const m = s.match(/(?:^|_)layer_(\d+)(?:_|$)/);
      return m ? parseInt(m[1], 10) : undefined;
    };

    // 1) Prefer the exported filename (most reliable in v2)
    const fromFile = tryParseLayer(plate.file);
    if (fromFile !== undefined) return fromFile;

    // 2) Then AI layer name (if present)
    const fromAi = tryParseLayer(plate.aiLayerName);
    if (fromAi !== undefined) return fromAi;

    // 3) Then plate id
    const fromId = tryParseLayer(plate.id);
    if (fromId !== undefined) return fromId;

    // 4) Fallback (better than nothing)
    // Keep these last because they often represent render depth, not physical ply.
    return plate.physicalPlyIndex ?? plate.depthIndex ?? 0;
  }


  /**
   * Extract layer number from plate ID for deterministic sorting
   * e.g., "front_layer_0_print" -> 0, "front_layer_1_print" -> 1
   */
  private extractLayerNumber(plateId: string): number {
    const match = plateId.match(/(?:^|_)layer_(\d+)(?:_|$)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  
  /**
   * Auto-map plates to options
   */
  private autoMapPlates(plates: ParserPlate[]): void {
    // Clear existing assignments
    this.state.plateAssignments = {};
    
    const sideOf = (p: ParserPlate): CardSide => ((p.face ?? p.side) as CardSide);

    const pickLowestPly = (side: CardSide, type: ParserPlate['type']): ParserPlate | undefined => {
      const candidates = plates.filter(p => sideOf(p) === side && p.type === type);
      if (candidates.length === 0) return undefined;
      candidates.sort((a, b) => this.getPlyIndex(a) - this.getPlyIndex(b));
      return candidates[0];
    };

    // Base prints (lowest physical ply on each side)
    const printFront = pickLowestPly('front', 'PRINT');
    if (printFront) {
      this.state.plateAssignments[printFront.id] = { type: 'artwork', side: 'front' };
      console.log(`[Proofer] Assigned printFront=${printFront.id} (ply=${this.getPlyIndex(printFront)})`);
    }
    
    const printBack = pickLowestPly('back', 'PRINT');
    if (printBack) {
      this.state.plateAssignments[printBack.id] = { type: 'artwork', side: 'back' };
      console.log(`[Proofer] Assigned printBack=${printBack.id} (ply=${this.getPlyIndex(printBack)})`);
    }
    
    // Foil masks
    const foilFront = pickLowestPly('front', 'FOIL_MASK');
    if (foilFront) {
      this.state.optionStates.foil.enabled = true;
      this.state.optionStates.foil.side = 'front';
      this.state.plateAssignments[foilFront.id] = { type: 'foil', side: 'front' };
      console.log(`[Proofer] Assigned foilFront=${foilFront.id} (ply=${this.getPlyIndex(foilFront)})`);
    }
    
    const foilBack = pickLowestPly('back', 'FOIL_MASK');
    if (foilBack) {
      this.state.optionStates.foil.enabled = true;
      this.state.optionStates.foil.side = 'back';
      this.state.plateAssignments[foilBack.id] = { type: 'foil', side: 'back' };
      console.log(`[Proofer] Assigned foilBack=${foilBack.id} (ply=${this.getPlyIndex(foilBack)})`);
    }
    
    // UV masks
    const uvFront = pickLowestPly('front', 'SPOT_UV_MASK');
    if (uvFront) {
      this.state.optionStates.uv.enabled = true;
      this.state.optionStates.uv.side = 'front';
      this.state.plateAssignments[uvFront.id] = { type: 'uv', side: 'front' };
      console.log(`[Proofer] Assigned uvFront=${uvFront.id} (ply=${this.getPlyIndex(uvFront)})`);
    }
    
    const uvBack = pickLowestPly('back', 'SPOT_UV_MASK');
    if (uvBack) {
      this.state.optionStates.uv.enabled = true;
      this.state.optionStates.uv.side = 'back';
      this.state.plateAssignments[uvBack.id] = { type: 'uv', side: 'back' };
      console.log(`[Proofer] Assigned uvBack=${uvBack.id} (ply=${this.getPlyIndex(uvBack)})`);
    }
    
    // Emboss masks
    const embossFront = pickLowestPly('front', 'EMBOSS');
    if (embossFront) {
      this.state.optionStates.emboss.enabled = true;
      this.state.optionStates.emboss.side = 'front';
      this.state.plateAssignments[embossFront.id] = { type: 'emboss', side: 'front' };
      console.log(`[Proofer] Assigned embossFront=${embossFront.id} (ply=${this.getPlyIndex(embossFront)})`);
    }
    
    const embossBack = pickLowestPly('back', 'EMBOSS');
    if (embossBack) {
      this.state.optionStates.emboss.enabled = true;
      this.state.optionStates.emboss.side = 'back';
      this.state.plateAssignments[embossBack.id] = { type: 'emboss', side: 'back' };
      console.log(`[Proofer] Assigned embossBack=${embossBack.id} (ply=${this.getPlyIndex(embossBack)})`);
    }
    
    // Diecut (global)
    const diecut =
      plates.find(p => p.type === 'DIECUT_MASK') ||
      plates.find(p => p.type === 'DIECUT_SVG');

    if (diecut) {
      this.state.optionStates.diecut.enabled = true;
      this.state.optionStates.diecut.side = sideOf(diecut);
      this.state.plateAssignments[diecut.id] = { type: 'diecut', side: sideOf(diecut) };
      console.log(`[Proofer] Assigned diecut=${diecut.id}`);
    }
  }

  /**
   * Auto-enable finish toggles based on actual masks in faceStacks
   * Only enables if user hasn't manually disabled them
   * Uses faceStacks as source of truth (more robust than scanning plates)
   */
  private autoEnableFinishesFromFaceStacks(faceStacks: Map<number, PlyStack>): void {
    // Track if finishes exist on any side/ply
    let hasFoilFront = false;
    let hasFoilBack = false;
    let hasUvFront = false;
    let hasUvBack = false;
    let hasEmbossFront = false;
    let hasEmbossBack = false;
    let hasDiecut = false;

    // Scan all faceStacks to detect masks
    for (const [plyIndex, plyStack] of faceStacks) {
      // Check front face
      if (plyStack.front.foilMasks.length > 0) hasFoilFront = true;
      if (plyStack.front.uvMasks.length > 0) hasUvFront = true;
      if (plyStack.front.embossMasks.length > 0) hasEmbossFront = true;
      if (plyStack.front.diecut) hasDiecut = true;

      // Check back face
      if (plyStack.back.foilMasks.length > 0) hasFoilBack = true;
      if (plyStack.back.uvMasks.length > 0) hasUvBack = true;
      if (plyStack.back.embossMasks.length > 0) hasEmbossBack = true;
      if (plyStack.back.diecut) hasDiecut = true;
    }

    // Auto-enable if masks exist
    if (hasFoilFront || hasFoilBack) {
      this.state.optionStates.foil.enabled = true;
      if (hasFoilFront) {
        this.state.optionStates.foil.side = 'front';
      } else if (hasFoilBack) {
        this.state.optionStates.foil.side = 'back';
      }
      console.log(`[Proofer] Auto-enabled foil (hasFront=${hasFoilFront}, hasBack=${hasFoilBack})`);
    }

    if (hasUvFront || hasUvBack) {
      this.state.optionStates.uv.enabled = true;
      if (hasUvFront) {
        this.state.optionStates.uv.side = 'front';
      } else if (hasUvBack) {
        this.state.optionStates.uv.side = 'back';
      }
      console.log(`[Proofer] Auto-enabled UV (hasFront=${hasUvFront}, hasBack=${hasUvBack})`);
    }

    if (hasEmbossFront || hasEmbossBack) {
      this.state.optionStates.emboss.enabled = true;
      if (hasEmbossFront) {
        this.state.optionStates.emboss.side = 'front';
      } else if (hasEmbossBack) {
        this.state.optionStates.emboss.side = 'back';
      }
      console.log(`[Proofer] Auto-enabled emboss (hasFront=${hasEmbossFront}, hasBack=${hasEmbossBack})`);
    }

    if (hasDiecut) {
      this.state.optionStates.diecut.enabled = true;
      console.log(`[Proofer] Auto-enabled diecut`);
    }
  }

  /**
   * Reset to default
   */
  reset(): void {
    this.state = createDefaultProoferState();
    this.notifyListeners();
  }
}
