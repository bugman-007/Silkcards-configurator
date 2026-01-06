/**
 * Proofer State Model
 * 
 * State management for the 3D Proofer application
 */

import * as THREE from 'three';

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
  w?: number; // Width (x1 - x0)
  h?: number; // Height (y1 - y0)
}

/**
 * Size in pixels
 */
export interface SizePx {
  w: number; // Width
  h: number; // Height
}

/**
 * Point in pixel coordinates
 */
export interface PointPx {
  x: number;
  y: number;
}

/**
 * Card size in pixels
 */
export interface CardPx {
  w: number; // Width
  h: number; // Height
}

/**
 * Parser Plate (from JSON)
 */
export interface ParserPlate {
  id: string;
  aiLayerName?: string; // Optional in new format
  side: CardSide;
  depthIndex: number; // Ply index (0, 1, 2, ...)
  physicalPlyIndex: number; // Same as depthIndex
  face: CardSide;
  type: ParserPlateType;
  assets: ParserPlateAssets;
  // New parser export fields
  file?: string; // PNG filename (e.g., "front_layer_0_spot_uv_mask.png")
  rectPx?: RectPx; // Bounding box in card pixel coordinates (top-left origin)
  sizePx?: SizePx; // Size of cropped texture (w == x1-x0, h == y1-y0)
  // New v2 format fields
  dpiUsed?: number; // DPI used for this plate
  cardPx?: CardPx; // Card canvas size in pixels
  startPx?: PointPx; // Start point (top-left) in card pixel space
  endPx?: PointPx; // End point (bottom-right) in card pixel space
  meta?: Record<string, any>;
}

/**
 * Parser Payload (from JSON / meta.json)
 */
export interface ParserPayload {
  schemaVersion?: string;
  version?: number; // v2 format version
  jobId?: string;
  createdAt?: string;
  generatedAt?: string;
  // Root-level DPI from meta.json
  dpi?: number;
  maxPx?: number;
  // Card info (optional in v2 - can be derived from plates)
  card?: {
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
  placementById?: Record<string, any>; // v2 format placement lookup
}

/**
 * FaceStack: Organized plates per ply and face
 * This is the render data model that drives compositing
 */
export interface FaceStack {
  prints: ParserPlate[]; // PRINT plates, sorted by layer number
  foilMasks: ParserPlate[]; // FOIL_MASK plates
  uvMasks: ParserPlate[]; // SPOT_UV_MASK plates
  embossMasks: ParserPlate[]; // EMBOSS plates
  diecut?: ParserPlate; // DIECUT_MASK or DIECUT_SVG (single plate)
}

/**
 * PlyStack: All faces for a single ply index
 */
export interface PlyStack {
  plyIndex: number;
  front: FaceStack;
  back: FaceStack;
}

/**
 * Composites: Final textures per ply/face/channel
 * These are the CPU-composited textures ready for GPU
 */
export interface Composites {
  frontPrint: THREE.Texture | null;
  backPrint: THREE.Texture | null;
  frontFoilMask: THREE.Texture | null;
  backFoilMask: THREE.Texture | null;
  frontUvMask: THREE.Texture | null;
  backUvMask: THREE.Texture | null;
  frontEmbossMask: THREE.Texture | null;
  backEmbossMask: THREE.Texture | null;
  diecutMask: THREE.Texture | null; // Shared or per-face
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
 * Edge Finish State
 * 
 * State for edge finish (color/foil on card edges)
 */
export interface EdgeFinishState {
  enabled: boolean;
  mode: 'color' | 'foil'; // 'color' for color tint, 'foil' for metallic foil
  color: string; // Hex color string (e.g., '#ff0000')
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
  plyCount: number; // Number of plies (from meta.json)
  
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
  
  // Emboss strength (0.0 to 1.0)
  embossStrength: number;
  
  // Edge finish state
  edgeFinish: EdgeFinishState;
  
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
  
  // FaceStacks: organized render data (computed from parserPayload)
  faceStacks?: Map<number, PlyStack>; // plyIndex -> PlyStack
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
    plyCount: 1, // Default single ply
    
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
    
    embossStrength: 0.12, // Default emboss strength
    
    edgeFinish: {
      enabled: false,
      mode: 'color',
      color: '#ffffff'
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
    
    parserPayload: undefined,
    
    faceStacks: undefined
  };
}