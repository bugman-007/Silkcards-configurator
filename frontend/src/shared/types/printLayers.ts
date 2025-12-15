/**
 * Print Layer Types
 * 
 * Defines the structure for print layers (foil, UV, emboss, diecut)
 */

export type LayerType = 'foil' | 'uv' | 'emboss' | 'diecut';
export type CardSide = 'front' | 'back';

/**
 * Print Layer
 * 
 * Represents a single print layer with its assigned file
 */
export interface PrintLayer {
  type: LayerType;
  side: CardSide;
  file?: File | string; // File object or URL string
  enabled: boolean;
}

/**
 * Print Layer Configuration
 * 
 * Complete configuration for all print layers
 */
export interface PrintLayerConfig {
  foil: {
    front?: File | string;
    back?: File | string;
  };
  uv: {
    front?: File | string;
    back?: File | string;
  };
  emboss: {
    front?: File | string;
    back?: File | string;
  };
  diecut: {
    front?: File | string;
    back?: File | string;
  };
}

