/**
 * Proofer State Model
 * 
 * State management for the 3D Proofer application
 */

export type ParserStatus = 'idle' | 'parsing' | 'success' | 'warning' | 'error';
export type CardSide = 'front' | 'back';
export type LayerType = 'artwork' | 'foil' | 'uv' | 'emboss' | 'diecut';

/**
 * Parser Plate Type
 */
export type ParserPlateType =
  | 'PRINT'
  | 'FOIL_MASK'
  | 'SPOT_UV_MASK'
  | 'EMBOSS'
  | 'DIECUT_MASK'
  | 'DIECUT_SVG';

/**
 * Parser Plate Asset URLs
 */
export interface ParserPlateAssets {
  png?: string;
  maskPng?: string;
  heightPng?: string;
  svg?: string;
}

/**
 * Rectangle in pixel coordinates (card space)
 */
export interface RectPx {
  x0: number; // Left edge
  y0: number; // Top edge
  x1: number; // Right edge
  y1: number; // Bottom edge
}

/**
 * Size in pixels
 */
export interface SizePx {
  w: number; // Width
  h: number; // Height
}

/**
 * Parser Plate (from JSON)
 */
export interface ParserPlate {
  id: string;
  aiLayerName: string;
  side: CardSide;
  depthIndex: number;
  physicalPlyIndex: number;
  face: CardSide;
  type: ParserPlateType;
  assets: ParserPlateAssets;
  // New parser export fields
  file?: string; // PNG filename (e.g., "front_layer_0_spot_uv_mask.png")
  rectPx?: RectPx; // Bounding box in card pixel coordinates (top-left origin)
  sizePx?: SizePx; // Size of cropped texture (w == x1-x0, h == y1-y0)
  meta?: Record<string, any>;
}

/**
 * Parser Payload (from JSON / meta.json)
 */
export interface ParserPayload {
  schemaVersion?: string;
  jobId?: string;
  createdAt?: string;
  // Root-level DPI from meta.json
  dpi?: number;
  card: {
    stockId?: string;
    thicknessPt: number;
    plyCount: number;
    size: {
      widthMm: number;
      heightMm: number;
      bleedMm?: number;
      safeMm?: number;
    };
    dpi?: number; // Legacy: also in card object
  };
  plates: ParserPlate[];
  layersDetected?: string[];
}

/**
 * Parsed Plate
 * 
 * Represents a plate extracted from uploaded file
 */
export interface ParsedPlate {
  id: string;
  type: LayerType;
  side: CardSide;
  filename: string;
  thumbnail?: string; // Base64 or URL
  file?: File | string; // File object or URL
}

/**
 * Option State
 * 
 * State for each print option (foil, uv, emboss, diecut)
 */
export interface OptionState {
  enabled: boolean;
  side: CardSide;
  assignedPlateId?: string; // ID of assigned plate from parsedPlates
}

/**
 * Artwork Transform
 * 
 * Transform applied to artwork layer
 */
export interface ArtworkTransform {
  positionX: number;
  positionY: number;
  scale: number; // Uniform scale
  rotation: number; // Degrees
}

/**
 * Warning
 * 
 * Warning message for the proofer
 */
export interface Warning {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

/**
 * Proofer State
 * 
 * Complete state for the 3D Proofer application
 */
export interface ProoferState {
  // Card dimensions
  width: number;
  height: number;
  thickness: number;
  cornerRadius: number;
  
  // File upload
  uploadedFile?: File;
  parserStatus: ParserStatus;
  parserError?: string;
  
  // Parsed plates
  parsedPlates: ParsedPlate[];
  
  // Option states
  optionStates: {
    foil: OptionState;
    uv: OptionState;
    emboss: OptionState;
    diecut: OptionState;
  };
  
  // Plate assignments (plateId -> layerType mapping)
  plateAssignments: Record<string, { type: LayerType; side: CardSide }>;
  
  // Artwork transform
  artworkTransform: ArtworkTransform;
  
  // Warnings
  warnings: Warning[];
  
  // Approval
  approved: boolean;
  
  // View side
  viewSide: CardSide;
  
  // Parser payload
  parserPayload?: ParserPayload;
}

/**
 * Create default proofer state
 */
export function createDefaultProoferState(): ProoferState {
  return {
    width: 88.9, // 3.5" in mm
    height: 50.8, // 2" in mm
    thickness: 0.56444, // 16pt in mm
    cornerRadius: 5,
    
    uploadedFile: undefined,
    parserStatus: 'idle',
    parserError: undefined,
    
    parsedPlates: [],
    
    optionStates: {
      foil: { enabled: false, side: 'front' },
      uv: { enabled: false, side: 'front' },
      emboss: { enabled: false, side: 'front' },
      diecut: { enabled: false, side: 'front' }
    },
    
    plateAssignments: {},
    
    artworkTransform: {
      positionX: 0,
      positionY: 0,
      scale: 1.0,
      rotation: 0
    },
    
    warnings: [],
    
    approved: false,
    
    viewSide: 'front',
    
    parserPayload: undefined
  };
}
