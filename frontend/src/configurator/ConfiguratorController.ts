/**
 * Configurator Controller
 * 
 * Manages the configuration state and provides mutation methods.
 * Notifies listeners when the configuration changes.
 */

import {
  ConfigState,
  LayerSide,
  FoilConfig,
  UVConfig,
  EmbossConfig,
  DieCutConfig,
  EdgeConfig,
  ExtrasConfig,
  ArtworkConfig,
  createDefaultConfigState,
  createPresetConfig,
  PresetName
} from './ConfigState.js';

export type ConfigListener = (state: ConfigState) => void;

/**
 * Configurator Controller
 * 
 * Central controller for all configuration state.
 * All UI components should interact with this controller, not directly with the engine.
 */
export class ConfiguratorController {
  private state: ConfigState;
  private listeners: Set<ConfigListener> = new Set();

  constructor(initialState?: ConfigState) {
    this.state = initialState || createDefaultConfigState();
  }

  /**
   * Get the current configuration state
   */
  getState(): ConfigState {
    return { ...this.state }; // Return a copy to prevent direct mutation
  }

  /**
   * Add a listener that will be called whenever the configuration changes
   */
  addListener(listener: ConfigListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: ConfigListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of a configuration change
   */
  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.listeners.forEach(listener => listener(stateCopy));
  }

  // ========== Foil Configuration ==========

  /**
   * Set foil enabled state for specific sides
   */
  setFoilEnabled(sides: LayerSide[], enabled: boolean): void {
    for (const side of sides) {
      if (!this.state[side].foil) {
        this.state[side].foil = {
          enabled: false,
          color: "gold",
          type: "solid",
          sides: []
        };
      }
      this.state[side].foil!.enabled = enabled;
      if (enabled) {
        this.state[side].foil!.sides = [...sides];
      } else {
        this.state[side].foil!.sides = [];
      }
    }
    this.notifyListeners();
  }

  /**
   * Set foil color
   */
  setFoilColor(color: FoilConfig["color"]): void {
    for (const side of ["front", "mid", "back"] as LayerSide[]) {
      if (this.state[side].foil) {
        this.state[side].foil!.color = color;
      }
    }
    this.notifyListeners();
  }

  /**
   * Set foil type
   */
  setFoilType(type: FoilConfig["type"]): void {
    for (const side of ["front", "mid", "back"] as LayerSide[]) {
      if (this.state[side].foil) {
        this.state[side].foil!.type = type;
      }
    }
    this.notifyListeners();
  }

  /**
   * Set custom foil texture
   */
  setFoilCustomTexture(side: LayerSide, textureUrl?: string): void {
    if (!this.state[side].foil) {
      this.state[side].foil = {
        enabled: false,
        color: "gold",
        type: "solid",
        sides: []
      };
    }
    this.state[side].foil!.customTexture = textureUrl;
    this.notifyListeners();
  }

  /**
   * Set custom foil mask
   */
  setFoilCustomMask(side: LayerSide, maskUrl?: string): void {
    if (!this.state[side].foil) {
      this.state[side].foil = {
        enabled: false,
        color: "gold",
        type: "solid",
        sides: []
      };
    }
    this.state[side].foil!.customMask = maskUrl;
    this.notifyListeners();
  }

  // ========== UV Configuration ==========

  /**
   * Set UV enabled state for specific sides
   */
  setUVEnabled(sides: LayerSide[], enabled: boolean): void {
    for (const side of sides) {
      if (!this.state[side].uv) {
        this.state[side].uv = {
          enabled: false,
          type: "spot",
          sides: []
        };
      }
      this.state[side].uv!.enabled = enabled;
      if (enabled) {
        this.state[side].uv!.sides = [...sides];
      } else {
        this.state[side].uv!.sides = [];
      }
    }
    this.notifyListeners();
  }

  /**
   * Set UV type
   */
  setUVType(type: UVConfig["type"]): void {
    for (const side of ["front", "mid", "back"] as LayerSide[]) {
      if (this.state[side].uv) {
        this.state[side].uv!.type = type;
      }
    }
    this.notifyListeners();
  }

  /**
   * Set custom UV mask
   */
  setUVCustomMask(side: LayerSide, maskUrl?: string): void {
    if (!this.state[side].uv) {
      this.state[side].uv = {
        enabled: false,
        type: "spot",
        sides: []
      };
    }
    this.state[side].uv!.customMask = maskUrl;
    this.notifyListeners();
  }

  // ========== Emboss Configuration ==========

  /**
   * Set emboss enabled state for specific sides
   */
  setEmbossEnabled(sides: LayerSide[], enabled: boolean): void {
    for (const side of sides) {
      if (!this.state[side].emboss) {
        this.state[side].emboss = {
          enabled: false,
          mode: "emboss",
          sides: []
        };
      }
      this.state[side].emboss!.enabled = enabled;
      if (enabled) {
        this.state[side].emboss!.sides = [...sides];
      } else {
        this.state[side].emboss!.sides = [];
      }
    }
    this.notifyListeners();
  }

  /**
   * Set emboss mode (emboss or deboss)
   */
  setEmbossMode(mode: EmbossConfig["mode"]): void {
    for (const side of ["front", "mid", "back"] as LayerSide[]) {
      if (this.state[side].emboss) {
        this.state[side].emboss!.mode = mode;
      }
    }
    this.notifyListeners();
  }

  /**
   * Set emboss height map
   */
  setEmbossHeightMap(side: LayerSide, heightMapUrl?: string): void {
    if (!this.state[side].emboss) {
      this.state[side].emboss = {
        enabled: false,
        mode: "emboss",
        sides: []
      };
    }
    this.state[side].emboss!.heightMap = heightMapUrl;
    this.notifyListeners();
  }

  // ========== Die Cut Configuration ==========

  /**
   * Set die cut enabled state for specific sides
   */
  setDieCutEnabled(sides: LayerSide[], enabled: boolean): void {
    for (const side of sides) {
      if (!this.state[side].dieCut) {
        this.state[side].dieCut = {
          enabled: false,
          type: "standard",
          sides: []
        };
      }
      this.state[side].dieCut!.enabled = enabled;
      if (enabled) {
        this.state[side].dieCut!.sides = [...sides];
      } else {
        this.state[side].dieCut!.sides = [];
      }
    }
    this.notifyListeners();
  }

  /**
   * Set die cut type
   */
  setDieCutType(type: DieCutConfig["type"]): void {
    for (const side of ["front", "mid", "back"] as LayerSide[]) {
      if (this.state[side].dieCut) {
        this.state[side].dieCut!.type = type;
      }
    }
    this.notifyListeners();
  }

  /**
   * Set custom die cut mask
   */
  setDieCutCustomMask(side: LayerSide, maskUrl?: string): void {
    if (!this.state[side].dieCut) {
      this.state[side].dieCut = {
        enabled: false,
        type: "standard",
        sides: []
      };
    }
    this.state[side].dieCut!.customMask = maskUrl;
    this.notifyListeners();
  }

  // ========== Edge Configuration ==========

  /**
   * Set edge configuration
   */
  setEdgeConfig(config: Partial<EdgeConfig>): void {
    this.state.edges = {
      ...this.state.edges,
      ...config
    };
    this.notifyListeners();
  }

  /**
   * Set edge enabled state
   */
  setEdgeEnabled(enabled: boolean): void {
    this.state.edges.enabled = enabled;
    this.notifyListeners();
  }

  /**
   * Set edge count
   */
  setEdgeCount(count: EdgeConfig["count"]): void {
    this.state.edges.count = count;
    this.notifyListeners();
  }

  /**
   * Set edge ink type
   */
  setEdgeInkType(inkType: EdgeConfig["inkType"]): void {
    this.state.edges.inkType = inkType;
    this.notifyListeners();
  }

  /**
   * Set edge color
   */
  setEdgeColor(color: string): void {
    this.state.edges.color = color;
    this.notifyListeners();
  }

  /**
   * Set foil edges
   */
  setFoilEdges(enabled: boolean): void {
    this.state.edges.foilEdges = enabled;
    this.notifyListeners();
  }

  // ========== Extras Configuration ==========

  /**
   * Set extras configuration
   */
  setExtrasConfig(config: Partial<ExtrasConfig>): void {
    this.state.extras = {
      ...this.state.extras,
      ...config
    };
    this.notifyListeners();
  }

  /**
   * Set PMS ink
   */
  setPMSInk(enabled: boolean): void {
    this.state.extras.pmsInk = enabled;
    this.notifyListeners();
  }

  /**
   * Set perforate
   */
  setPerforate(enabled: boolean): void {
    this.state.extras.perforate = enabled;
    this.notifyListeners();
  }

  /**
   * Set variable data
   */
  setVariableData(enabled: boolean, text?: string): void {
    this.state.extras.variableDataEnabled = enabled;
    if (text !== undefined) {
      this.state.extras.variableDataText = text;
    }
    this.notifyListeners();
  }

  /**
   * Set QR code
   */
  setQRCode(enabled: boolean): void {
    this.state.extras.qrCodeEnabled = enabled;
    this.notifyListeners();
  }

  // ========== Artwork Configuration ==========

  /**
   * Set artwork for a specific side
   */
  setArtwork(side: LayerSide, url?: string): void {
    if (side === "front") {
      this.state.artwork.frontArtwork = url;
    } else if (side === "back") {
      this.state.artwork.backArtwork = url;
    } else if (side === "mid") {
      this.state.artwork.midLayerArtwork = url;
    }
    this.notifyListeners();
  }

  /**
   * Set artwork configuration
   */
  setArtworkConfig(config: Partial<ArtworkConfig>): void {
    this.state.artwork = {
      ...this.state.artwork,
      ...config
    };
    this.notifyListeners();
  }

  // ========== Presets ==========

  /**
   * Apply a preset configuration
   */
  setPreset(presetName: PresetName): void {
    this.state = createPresetConfig(presetName);
    this.notifyListeners();
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.state = createDefaultConfigState();
    this.notifyListeners();
  }
}

