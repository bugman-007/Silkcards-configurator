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
  ParserPlate
} from './ProoferState.js';

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
    this.state.width = width;
    this.state.height = height;
    this.state.thickness = thickness;
    this.state.cornerRadius = cornerRadius;
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
    
    // Store payload
    this.state.parserPayload = payload;
    
    // Update card dimensions from payload
    const cardSize = payload.card.size;
    const thicknessPt = payload.card.thicknessPt;
    const thicknessMm = (thicknessPt / 1000) * 25.4; // Convert pt to mm (1pt = 1/1000 inch, 1 inch = 25.4mm)
    
    this.state.width = cardSize.widthMm;
    this.state.height = cardSize.heightMm;
    this.state.thickness = thicknessMm;
    // Keep existing cornerRadius or use default
    if (!this.state.cornerRadius) {
      this.state.cornerRadius = 5;
    }
    
    // Convert parser plates to ParsedPlate format
    const parsedPlates: ParsedPlate[] = payload.plates.map(plate => {
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
      
      return {
        id: plate.id,
        type: layerType,
        side: plate.side,
        filename: plate.aiLayerName,
        file: assetUrl // Store URL string
      };
    });
    
    this.state.parsedPlates = parsedPlates;
    
    // Auto-map plates by type/side/depthIndex
    this.autoMapPlates(payload.plates);
    
    this.notifyListeners();
  }
  
  /**
   * Auto-map plates to options
   */
  private autoMapPlates(plates: ParserPlate[]): void {
    // Clear existing assignments
    this.state.plateAssignments = {};
    
    // Find front base print (side=front, type=PRINT, depthIndex=0)
    const printFront = plates.find(p => 
      p.side === 'front' && p.type === 'PRINT' && p.depthIndex === 0
    );
    if (printFront) {
      this.state.plateAssignments[printFront.id] = { type: 'artwork', side: 'front' };
      console.log(`[Proofer] Assigned printFront=${printFront.id}`);
    }
    
    // Find back base print (side=back, type=PRINT, depthIndex=0)
    const printBack = plates.find(p => 
      p.side === 'back' && p.type === 'PRINT' && p.depthIndex === 0
    );
    if (printBack) {
      this.state.plateAssignments[printBack.id] = { type: 'artwork', side: 'back' };
      console.log(`[Proofer] Assigned printBack=${printBack.id}`);
    }
    
    // Find foil masks
    const foilFront = plates.find(p => 
      p.side === 'front' && p.type === 'FOIL_MASK' && p.depthIndex === 0
    );
    if (foilFront) {
      this.state.optionStates.foil.enabled = true;
      this.state.optionStates.foil.side = 'front';
      this.state.plateAssignments[foilFront.id] = { type: 'foil', side: 'front' };
      console.log(`[Proofer] Assigned foilFront=${foilFront.id}`);
    }
    
    const foilBack = plates.find(p => 
      p.side === 'back' && p.type === 'FOIL_MASK' && p.depthIndex === 0
    );
    if (foilBack) {
      this.state.optionStates.foil.enabled = true;
      this.state.optionStates.foil.side = 'back';
      this.state.plateAssignments[foilBack.id] = { type: 'foil', side: 'back' };
      console.log(`[Proofer] Assigned foilBack=${foilBack.id}`);
    }
    
    // Find UV masks
    const uvFront = plates.find(p => 
      p.side === 'front' && p.type === 'SPOT_UV_MASK' && p.depthIndex === 0
    );
    if (uvFront) {
      this.state.optionStates.uv.enabled = true;
      this.state.optionStates.uv.side = 'front';
      this.state.plateAssignments[uvFront.id] = { type: 'uv', side: 'front' };
      console.log(`[Proofer] Assigned uvFront=${uvFront.id}`);
    }
    
    const uvBack = plates.find(p => 
      p.side === 'back' && p.type === 'SPOT_UV_MASK' && p.depthIndex === 0
    );
    if (uvBack) {
      this.state.optionStates.uv.enabled = true;
      this.state.optionStates.uv.side = 'back';
      this.state.plateAssignments[uvBack.id] = { type: 'uv', side: 'back' };
      console.log(`[Proofer] Assigned uvBack=${uvBack.id}`);
    }
    
    // Find emboss
    const embossFront = plates.find(p => 
      p.side === 'front' && p.type === 'EMBOSS' && p.depthIndex === 0
    );
    if (embossFront) {
      this.state.optionStates.emboss.enabled = true;
      this.state.optionStates.emboss.side = 'front';
      this.state.plateAssignments[embossFront.id] = { type: 'emboss', side: 'front' };
      console.log(`[Proofer] Assigned embossFront=${embossFront.id}`);
    }
    
    const embossBack = plates.find(p => 
      p.side === 'back' && p.type === 'EMBOSS' && p.depthIndex === 0
    );
    if (embossBack) {
      this.state.optionStates.emboss.enabled = true;
      this.state.optionStates.emboss.side = 'back';
      this.state.plateAssignments[embossBack.id] = { type: 'emboss', side: 'back' };
      console.log(`[Proofer] Assigned embossBack=${embossBack.id}`);
    }
    
    // Find diecut mask (can be on either side, but affects all)
    const diecut = plates.find(p => p.type === 'DIECUT_MASK') || plates.find(p => p.type === 'DIECUT_SVG');
    if (diecut) {
      this.state.optionStates.diecut.enabled = true;
      this.state.optionStates.diecut.side = diecut.side;
      this.state.plateAssignments[diecut.id] = { type: 'diecut', side: diecut.side };
      console.log(`[Proofer] Assigned diecut=${diecut.id}`);
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
