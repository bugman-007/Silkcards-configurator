/**
 * Config State Model
 * 
 * Simplified configuration state for mandatory configurator options only.
 * This model is independent of UI and rendering concerns.
 */

export type StockType = "standard" | "premium" | "luxury";

export interface ConfigState {
  // Stock selection (card type)
  stock: StockType;
  
  // Finish toggles (ON/OFF only)
  foil: boolean;
  uv: boolean;
  emboss: boolean;
  deboss: boolean;
  dieCut: boolean;
  
  // Emboss parameters
  embossStrength: number; // Strength of emboss effect (0.0 - 1.0)
}

/**
 * Create a default configuration state
 */
export function createDefaultConfigState(): ConfigState {
  return {
    stock: "standard",
    foil: false,
    uv: false,
    emboss: false,
    deboss: false,
    dieCut: false,
    embossStrength: 0.12 // Default emboss strength (increased for stronger effect)
  };
}

