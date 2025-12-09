/**
 * Config State Model
 * 
 * Defines the complete configuration state for the 3D card configurator.
 * This model is independent of UI and rendering concerns.
 */

export type LayerSide = "front" | "mid" | "back";

export type FoilColor = 
  | "gold" 
  | "silver" 
  | "rose_gold" 
  | "copper" 
  | "red" 
  | "pink" 
  | "blue" 
  | "teal" 
  | "purple" 
  | "green" 
  | "black" 
  | "other";

export type FoilType = "solid" | "pearl" | "pattern" | "holographic";

export interface FoilConfig {
  enabled: boolean;
  color: FoilColor;
  type: FoilType;
  sides: LayerSide[]; // which layers use this foil
  customTexture?: string; // url or id for custom foil texture
  customMask?: string;    // url or id for custom mask PNG
}

export type UVType = "spot" | "raised" | "dusting";

export interface UVConfig {
  enabled: boolean;
  type: UVType;
  sides: LayerSide[];
  customMask?: string;
}

export type EdgeInkType = "standard" | "metallic" | "fluorescent";

export interface EdgeConfig {
  enabled: boolean;
  count: 0 | 1 | 2 | 3 | 4; // number of edges colored
  inkType: EdgeInkType;
  color: string; // hex color
  foilEdges: boolean;
  foilPattern?: string;
}

export type DieCutType = "standard" | "laser" | "shape";

export interface DieCutConfig {
  enabled: boolean;
  type: DieCutType;
  sides: LayerSide[];
  customMask?: string;
}

export type EmbossMode = "emboss" | "deboss";

export interface EmbossConfig {
  enabled: boolean;
  mode: EmbossMode;
  sides: LayerSide[];
  heightMap?: string; // url for height map PNG
}

export interface ExtrasConfig {
  pmsInk: boolean;
  perforate: boolean;
  variableDataEnabled: boolean;
  variableDataText: string;
  qrCodeEnabled: boolean;
}

export interface ArtworkConfig {
  frontArtwork?: string; // url or id
  backArtwork?: string;  // url or id
  midLayerArtwork?: string; // url or id
}

export interface LayerConfig {
  foil?: FoilConfig;
  uv?: UVConfig;
  emboss?: EmbossConfig;
  dieCut?: DieCutConfig;
}

export interface ConfigState {
  front: LayerConfig;
  mid: LayerConfig;
  back: LayerConfig;
  artwork: ArtworkConfig;
  edges: EdgeConfig;
  extras: ExtrasConfig;
  
  // Card dimensions are managed separately in TestHarness/CardGeometry
  // but we can reference them here if needed for presets
}

/**
 * Create a default configuration state
 */
export function createDefaultConfigState(): ConfigState {
  return {
    front: {
      foil: {
        enabled: false,
        color: "gold",
        type: "solid",
        sides: []
      },
      uv: {
        enabled: false,
        type: "spot",
        sides: []
      },
      emboss: {
        enabled: false,
        mode: "emboss",
        sides: []
      },
      dieCut: {
        enabled: false,
        type: "standard",
        sides: []
      }
    },
    mid: {
      foil: {
        enabled: false,
        color: "gold",
        type: "solid",
        sides: []
      },
      uv: {
        enabled: false,
        type: "spot",
        sides: []
      },
      emboss: {
        enabled: false,
        mode: "emboss",
        sides: []
      },
      dieCut: {
        enabled: false,
        type: "standard",
        sides: []
      }
    },
    back: {
      foil: {
        enabled: false,
        color: "gold",
        type: "solid",
        sides: []
      },
      uv: {
        enabled: false,
        type: "spot",
        sides: []
      },
      emboss: {
        enabled: false,
        mode: "emboss",
        sides: []
      },
      dieCut: {
        enabled: false,
        type: "standard",
        sides: []
      }
    },
    artwork: {
      // No artwork by default
    },
    edges: {
      enabled: false,
      count: 0,
      inkType: "standard",
      color: "#000000",
      foilEdges: false
    },
    extras: {
      pmsInk: false,
      perforate: false,
      variableDataEnabled: false,
      variableDataText: "",
      qrCodeEnabled: false
    }
  };
}

/**
 * Preset configurations
 */
export type PresetName = "standard" | "foil" | "uv" | "emboss" | "premium";

/**
 * Create a preset configuration
 */
export function createPresetConfig(preset: PresetName): ConfigState {
  const base = createDefaultConfigState();

  switch (preset) {
    case "standard":
      // No special effects
      return base;

    case "foil":
      return {
        ...base,
        front: {
          ...base.front,
          foil: {
            enabled: true,
            color: "gold",
            type: "solid",
            sides: ["front"]
          }
        }
      };

    case "uv":
      return {
        ...base,
        front: {
          ...base.front,
          uv: {
            enabled: true,
            type: "spot",
            sides: ["front"]
          }
        }
      };

    case "emboss":
      return {
        ...base,
        front: {
          ...base.front,
          emboss: {
            enabled: true,
            mode: "emboss",
            sides: ["front"]
          }
        }
      };

    case "premium":
      return {
        ...base,
        front: {
          ...base.front,
          foil: {
            enabled: true,
            color: "rose_gold",
            type: "pearl",
            sides: ["front"]
          },
          uv: {
            enabled: true,
            type: "raised",
            sides: ["front"]
          },
          emboss: {
            enabled: true,
            mode: "emboss",
            sides: ["front"]
          }
        },
        edges: {
          enabled: true,
          count: 4,
          inkType: "metallic",
          color: "#D4AF37",
          foilEdges: true
        }
      };

    default:
      return base;
  }
}

