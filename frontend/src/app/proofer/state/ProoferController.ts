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
  LayerType
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
   * Reset to default
   */
  reset(): void {
    this.state = createDefaultProoferState();
    this.notifyListeners();
  }
}
