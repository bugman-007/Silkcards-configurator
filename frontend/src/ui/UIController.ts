/**
 * UI Controller
 * 
 * Root UI component that initializes the 3D engine and binds UI controls.
 * Handles all user interactions and updates the engine accordingly.
 */

import * as THREE from 'three';
import { EngineController } from '../engine/EngineController.js';
import { CardGeometry } from '../geometry/CardGeometry.js';
import { MaterialPipeline } from '../materials/MaterialPipeline.js';
import { ResourceManager } from '../core/ResourceManager.js';
import { ConfiguratorController } from '../state/ConfiguratorController.js';
import { EngineBridge } from '../state/EngineBridge.js';
import type { StockType } from '../state/ConfigState.js';

/**
 * UI Controller
 * 
 * Manages initialization, UI bindings, and user interactions.
 */
export class UIController {
  private engineController: EngineController;
  private cardGeometry: CardGeometry;
  private material: THREE.ShaderMaterial;
  private cardMesh: THREE.Mesh;
  private configController: ConfiguratorController;
  private engineBridge: EngineBridge;

  // Current card dimensions
  private width: number = 88.9; // 3.5" in mm
  private height: number = 50.8; // 2" in mm
  private thickness: number = 0.56444; // 16pt in mm
  private cornerRadius: number = 5;
  private isCustomSize: boolean = false;

  /**
   * Initialize the UI controller
   */
  static async init(): Promise<UIController> {
    const controller = new UIController();
    await controller.initialize();
    return controller;
  }

  private constructor() {
    // Private constructor
  }

  /**
   * Initialize engine, resources, geometry, and material
   */
  private async initialize(): Promise<void> {
    // Initialize EngineController
    this.engineController = new EngineController('#canvas');

    // Initialize ResourceManager
    await ResourceManager.init();

    // Load finish masks (must load before material initialization)
    await ResourceManager.loadFinishMasks();

    // Get mask textures
    const foilMask = ResourceManager.getMaskTexture('foil');
    const uvMask = ResourceManager.getMaskTexture('uv');
    const embossMask = ResourceManager.getMaskTexture('emboss');
    const dieCutMask = ResourceManager.getMaskTexture('diecut');

    // Start with white texture - color will be controlled by Color section
    // Using white texture (1,1,1) so that uBaseColor directly controls the card color
    const artworkTexture = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(1.0, 1.0, 1.0));

    // Create card geometry
    this.cardGeometry = new CardGeometry({
      width: this.width,
      height: this.height,
      thickness: this.thickness,
      cornerRadius: this.cornerRadius
    });

    // Create material with mask textures
    this.material = MaterialPipeline.createCardMaterial({
      artwork: artworkTexture,
      foilMask: foilMask || ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0)),
      uvMask: uvMask || ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0)),
      embossMask: embossMask || ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0)),
      dieCutMask: dieCutMask || ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0))
    });

    // Create mesh and add to scene
    this.cardMesh = new THREE.Mesh(this.cardGeometry.geometry, this.material);
    this.engineController.add(this.cardMesh);

    // Start render loop
    this.engineController.start();

    // Initialize configurator
    this.configController = new ConfiguratorController();
    this.engineBridge = new EngineBridge(this.configController, this.material);

    // Register material for lighting updates
    this.engineController.registerMaterialForLighting(this.material);

    // Set up UI bindings
    this.setupUI();
    this.setupEventListeners();
    this.showStep('size');

    // Expose for debugging
    (window as any).card = this.cardGeometry;
    (window as any).cardMesh = this.cardMesh;
  }

  /**
   * Set up UI elements
   */
  private setupUI(): void {
    // Set initial slider values
    const widthSlider = document.getElementById('width-slider') as HTMLInputElement;
    const heightSlider = document.getElementById('height-slider') as HTMLInputElement;
    const cornerRadiusSlider = document.getElementById('corner-radius-slider') as HTMLInputElement;
    
    if (widthSlider) widthSlider.value = this.width.toString();
    if (heightSlider) heightSlider.value = this.height.toString();
    if (cornerRadiusSlider) cornerRadiusSlider.value = this.cornerRadius.toString();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Step navigation
    const stepButtons = document.querySelectorAll('.step-btn');
    stepButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const step = btn.getAttribute('data-step');
        if (step) this.showStep(step);
      });
    });

    // Size option cards
    const sizeOptionCards = document.querySelectorAll('.size-option-card');
    sizeOptionCards.forEach(card => {
      card.addEventListener('click', () => {
        sizeOptionCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        const width = parseFloat(card.getAttribute('data-width') || '88.9');
        const height = parseFloat(card.getAttribute('data-height') || '50.8');
        
        this.width = width;
        this.height = height;
        this.isCustomSize = false;
        
        const customSizeControls = document.getElementById('custom-size-controls');
        if (customSizeControls) customSizeControls.style.display = 'none';
        
        this.updateDimensions();
      });
    });

    // Custom size toggle
    const customSizeToggle = document.getElementById('custom-size-toggle');
    if (customSizeToggle) {
      customSizeToggle.addEventListener('click', () => {
        const customSizeControls = document.getElementById('custom-size-controls');
        if (customSizeControls) {
          const isVisible = customSizeControls.style.display !== 'none';
          customSizeControls.style.display = isVisible ? 'none' : 'block';
          this.isCustomSize = !isVisible;
        }
      });
    }

    // Custom size sliders
    const widthSlider = document.getElementById('width-slider') as HTMLInputElement;
    if (widthSlider) {
      widthSlider.addEventListener('input', () => {
        if (this.isCustomSize) {
          this.width = parseFloat(widthSlider.value);
          this.updateDimensions();
          this.updateValueDisplay('width-value', `${this.width} mm`);
        }
      });
    }

    const heightSlider = document.getElementById('height-slider') as HTMLInputElement;
    if (heightSlider) {
      heightSlider.addEventListener('input', () => {
        if (this.isCustomSize) {
          this.height = parseFloat(heightSlider.value);
          this.updateDimensions();
          this.updateValueDisplay('height-value', `${this.height} mm`);
        }
      });
    }

    // Corner radius slider
    const cornerRadiusSlider = document.getElementById('corner-radius-slider') as HTMLInputElement;
    if (cornerRadiusSlider) {
      cornerRadiusSlider.addEventListener('input', () => {
        this.cornerRadius = parseFloat(cornerRadiusSlider.value);
        this.updateDimensions();
        this.updateValueDisplay('corner-radius-value', `${this.cornerRadius} mm`);
      });
    }

    // Thickness options
    const thicknessOptions = document.querySelectorAll('.thickness-option');
    thicknessOptions.forEach(option => {
      option.addEventListener('click', () => {
        thicknessOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        const thickness = parseFloat(option.getAttribute('data-thickness') || '5.6444');
        this.thickness = thickness / 10;
        this.updateDimensions();
      });
    });

    // Stock selection
    const stockSelect = document.getElementById('stock-select') as HTMLSelectElement;
    if (stockSelect) {
      stockSelect.addEventListener('change', () => {
        const stock = stockSelect.value as StockType;
        this.configController.setStock(stock);
      });
    }

    // Finish toggles
    const foilToggle = document.getElementById('foil-toggle') as HTMLInputElement;
    if (foilToggle) {
      foilToggle.addEventListener('change', () => {
        this.configController.setFoilEnabled(foilToggle.checked);
      });
    }

    const uvToggle = document.getElementById('uv-toggle') as HTMLInputElement;
    if (uvToggle) {
      uvToggle.addEventListener('change', () => {
        this.configController.setUVEnabled(uvToggle.checked);
      });
    }

    const embossToggle = document.getElementById('emboss-toggle') as HTMLInputElement;
    if (embossToggle) {
      embossToggle.addEventListener('change', () => {
        this.configController.setEmbossEnabled(embossToggle.checked);
      });
    }

    const diecutToggle = document.getElementById('diecut-toggle') as HTMLInputElement;
    if (diecutToggle) {
      diecutToggle.addEventListener('change', () => {
        this.configController.setDieCutEnabled(diecutToggle.checked);
      });
    }

    // Base color swatches
    const baseColorSwatches = document.querySelectorAll('#base-color-swatches .color-swatch');
    baseColorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        baseColorSwatches.forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        
        const swatchEl = swatch as HTMLElement;
        const styleAttr = swatchEl.getAttribute('style');
        if (styleAttr) {
          const match = styleAttr.match(/background:\s*(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3})/);
          if (match && match[1]) {
            MaterialPipeline.updateBaseColor(this.material, match[1]);
          }
        }
      });
    });

    // Custom base color picker
    const customColorPicker = document.getElementById('custom-color-picker') as HTMLInputElement;
    if (customColorPicker) {
      customColorPicker.addEventListener('change', () => {
        MaterialPipeline.updateBaseColor(this.material, customColorPicker.value);
        const customColorSwatch = document.getElementById('custom-color-swatch');
        if (customColorSwatch) {
          customColorSwatch.style.background = customColorPicker.value;
          baseColorSwatches.forEach(s => s.classList.remove('selected'));
          customColorSwatch.classList.add('selected');
        }
      });
    }

    // Edge color swatches
    const edgeColorSwatches = document.querySelectorAll('#edge-color-swatches .color-swatch');
    edgeColorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        edgeColorSwatches.forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        
        const swatchEl = swatch as HTMLElement;
        const styleAttr = swatchEl.getAttribute('style');
        if (styleAttr) {
          const match = styleAttr.match(/background:\s*(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3})/);
          if (match && match[1]) {
            this.configController.setEdgeColor(match[1]);
          }
        }
      });
    });

    // Custom edge color picker
    const customEdgeColorPicker = document.getElementById('custom-edge-color-picker') as HTMLInputElement;
    if (customEdgeColorPicker) {
      customEdgeColorPicker.addEventListener('change', () => {
        this.configController.setEdgeColor(customEdgeColorPicker.value);
        const customEdgeColorSwatch = document.getElementById('custom-edge-color-swatch');
        if (customEdgeColorSwatch) {
          customEdgeColorSwatch.style.background = customEdgeColorPicker.value;
          edgeColorSwatches.forEach(s => s.classList.remove('selected'));
          customEdgeColorSwatch.classList.add('selected');
        }
      });
    }
  }

  /**
   * Update card dimensions
   */
  private updateDimensions(): void {
    this.cardGeometry.updateDimensions(this.width, this.height, this.thickness, this.cornerRadius);
    // Ensure mesh references updated geometry
    this.cardMesh.geometry = this.cardGeometry.geometry;
  }

  /**
   * Update value display
   */
  private updateValueDisplay(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * Show step
   */
  private showStep(step: string): void {
    const stepButtons = document.querySelectorAll('.step-btn');
    const configSections = document.querySelectorAll('.config-section');
    
    stepButtons.forEach(btn => {
      if (btn.getAttribute('data-step') === step) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    configSections.forEach(section => {
      if (section.getAttribute('data-step') === step) {
        (section as HTMLElement).style.display = 'block';
      } else {
        (section as HTMLElement).style.display = 'none';
      }
    });
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.engineController) {
      this.engineController.dispose();
    }
    if (this.cardGeometry) {
      this.cardGeometry.dispose();
    }
  }
}

