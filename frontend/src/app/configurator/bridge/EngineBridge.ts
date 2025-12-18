/**
 * Engine Bridge
 * 
 * Connects the ConfiguratorController to the 3D engine.
 * Listens to config changes and updates materials with generic effects.
 */

import * as THREE from 'three';
import { ConfiguratorController } from '../state/ConfiguratorController.js';
import { ConfigState, StockType } from '../state/ConfigState.js';
import { MaterialPipeline } from '../materials/MaterialPipeline.js';

/**
 * Stock color mapping (for stock preview)
 */
const STOCK_COLORS: Record<StockType, THREE.Color> = {
  standard: new THREE.Color(1.0, 1.0, 1.0),
  premium: new THREE.Color(0.95, 0.95, 0.98),
  luxury: new THREE.Color(0.98, 0.97, 0.95)
};

/**
 * Engine Bridge
 * 
 * Subscribes to ConfiguratorController and updates the 3D engine
 * when configuration changes. Uses generic placeholder effects only.
 */
export class EngineBridge {
  private controller: ConfiguratorController;
  private material: THREE.ShaderMaterial;
  private currentStock: StockType; // Track current stock to only update color when stock changes

  constructor(controller: ConfiguratorController, material: THREE.ShaderMaterial) {
    this.controller = controller;
    this.material = material;
    this.currentStock = controller.getState().stock;

    // Subscribe to config changes
    this.controller.addListener((state) => this.onConfigChange(state));

    // Apply initial configuration
    this.onConfigChange(this.controller.getState());
  }

  /**
   * Handle configuration changes
   */
  private onConfigChange(state: ConfigState): void {
    // Only update stock color when stock actually changes
    // This prevents resetting user-selected colors when finish toggles change
    if (state.stock !== this.currentStock) {
      const stockColor = STOCK_COLORS[state.stock];
      MaterialPipeline.updateBaseColor(this.material, stockColor);
      this.currentStock = state.stock;
    }

    // Update finish effects
    MaterialPipeline.updateFoil(this.material, state.foil);
    MaterialPipeline.updateUV(this.material, state.uv);
    
    // Determine emboss mode: +1.0 for emboss (raised), -1.0 for deboss (indented)
    const embossEnabled = state.emboss || state.deboss;
    const embossMode = state.emboss ? 1.0 : (state.deboss ? -1.0 : 1.0);
    
    MaterialPipeline.updateEmbossParams(
      this.material,
      embossEnabled,
      state.embossStrength,
      embossMode
    );
    MaterialPipeline.updateDieCut(this.material, state.dieCut);
    
    // Update edge color
    MaterialPipeline.updateEdgeColor(this.material, state.edgeColor);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // No resources to dispose
  }
}

