/**
 * Configurator Controller
 * 
 * Manages the simplified configuration state and provides mutation methods.
 * Notifies listeners when the configuration changes.
 */

import {
  ConfigState,
  StockType,
  createDefaultConfigState
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
    return { ...this.state };
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

  /**
   * Set stock type (card type)
   */
  setStock(stock: StockType): void {
    this.state.stock = stock;
    this.notifyListeners();
  }

  /**
   * Set foil enabled state
   */
  setFoilEnabled(enabled: boolean): void {
    this.state.foil = enabled;
    this.notifyListeners();
  }

  /**
   * Set UV gloss enabled state
   */
  setUVEnabled(enabled: boolean): void {
    this.state.uv = enabled;
    this.notifyListeners();
  }

  /**
   * Set emboss enabled state
   */
  setEmbossEnabled(enabled: boolean): void {
    this.state.emboss = enabled;
    // If emboss is enabled, disable deboss
    if (enabled) {
      this.state.deboss = false;
    }
    this.notifyListeners();
  }

  /**
   * Set deboss enabled state
   */
  setDebossEnabled(enabled: boolean): void {
    this.state.deboss = enabled;
    // If deboss is enabled, disable emboss
    if (enabled) {
      this.state.emboss = false;
    }
    this.notifyListeners();
  }

  /**
   * Set emboss strength (0.0 - 1.0)
   */
  setEmbossStrength(strength: number): void {
    this.state.embossStrength = Math.max(0.0, Math.min(1.0, strength));
    this.notifyListeners();
  }

  /**
   * Set die-cut enabled state
   */
  setDieCutEnabled(enabled: boolean): void {
    this.state.dieCut = enabled;
    this.notifyListeners();
  }

  /**
   * Set edge color (hex color string, e.g., "#FFFFFF")
   */
  setEdgeColor(color: string): void {
    this.state.edgeColor = color;
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

