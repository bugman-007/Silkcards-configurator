import * as THREE from 'three';
import { EngineController } from '../engine/EngineController.js';
import { CardGeometry } from '../engine/CardGeometry.js';
import { MaterialPipeline } from '../engine/MaterialPipeline.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { ConfiguratorController } from '../configurator/ConfiguratorController.js';
import { EngineBridge } from '../configurator/EngineBridge.js';
import type { LayerSide } from '../configurator/ConfigState.js';

/**
 * Test Harness
 * Development controls and initialization for the 3D card engine
 */
export class TestHarness {
  private engineController: EngineController;
  private cardGeometry: CardGeometry;
  private material: THREE.ShaderMaterial;
  private cardMesh: THREE.Mesh;
  
  // Phase 2: Configurator
  private configController: ConfiguratorController;
  private engineBridge: EngineBridge;

  // Current values
  private width: number = 88.9; // 3.5" in mm (default: Traditional)
  private height: number = 50.8; // 2" in mm
  private thickness: number = 0.56444; // 16pt in mm (1pt = 0.352778mm)
  private cornerRadius: number = 5;
  private isCustomSize: boolean = false;

  // UI Elements
  private previewPanel: HTMLElement | null = null;
  private fullscreenBtn: HTMLElement | null = null;
  private screenshotBtn: HTMLElement | null = null;
  private viewModeSelect: HTMLSelectElement | null = null;
  private stepButtons: NodeListOf<HTMLElement> | null = null;
  private configSections: NodeListOf<HTMLElement> | null = null;
  private priceDisplay: HTMLElement | null = null;
  private addToCartBtn: HTMLElement | null = null;

  // Size options
  private sizeOptionCards: NodeListOf<HTMLElement> | null = null;
  private customSizeToggle: HTMLElement | null = null;
  private customSizeControls: HTMLElement | null = null;
  
  // Sliders (for custom size)
  private widthSlider: HTMLInputElement | null = null;
  private heightSlider: HTMLInputElement | null = null;
  private cornerRadiusSlider: HTMLInputElement | null = null;

  // Thickness options
  private thicknessOptions: NodeListOf<HTMLElement> | null = null;

  // Layer toggles
  private foilToggle: HTMLElement | null = null;
  private uvToggle: HTMLElement | null = null;
  private embossToggle: HTMLElement | null = null;

  // Option items
  private materialOptions: NodeListOf<HTMLElement> | null = null;
  private colorSwatches: NodeListOf<HTMLElement> | null = null;
  private finishOptions: NodeListOf<HTMLElement> | null = null;

  private basePrice: number = 0;

  /**
   * Initialize the test harness
   */
  static async init(): Promise<TestHarness> {
    const harness = new TestHarness();
    await harness.initialize();
    return harness;
  }

  private constructor() {
    // Private constructor - use init() instead
  }

  /**
   * Initialize engine, resources, geometry, and material
   */
  private async initialize(): Promise<void> {
    console.log('Initializing Test Harness...');

    // Step 1: Initialize EngineController
    this.engineController = new EngineController('#canvas');

    // Step 2: Initialize ResourceManager
    await ResourceManager.init();

    // Step 3: Load textures (with fallbacks)
    let artworkTexture: THREE.Texture;
    let foilMask: THREE.Texture;
    let uvMask: THREE.Texture;
    let embossHeightMap: THREE.Texture;

    try {
      artworkTexture = await ResourceManager.loadTexture('/textures/artwork.jpg');
      console.log('Artwork texture loaded');
    } catch (error) {
      console.warn('Artwork texture not found, using placeholder');
      artworkTexture = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.8, 0.8, 0.9));
    }

    try {
      foilMask = await ResourceManager.loadMask('/masks/foil.png');
      console.log('Foil mask loaded');
    } catch (error) {
      console.warn('Foil mask not found, using placeholder');
      foilMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.0, 0.0, 0.0));
    }

    try {
      uvMask = await ResourceManager.loadMask('/masks/uv.png');
      console.log('UV mask loaded');
    } catch (error) {
      console.warn('UV mask not found, using placeholder');
      uvMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.0, 0.0, 0.0));
    }

    try {
      embossHeightMap = await ResourceManager.loadMask('/masks/emboss.png');
      console.log('Emboss height map loaded');
    } catch (error) {
      console.warn('Emboss height map not found, using placeholder');
      embossHeightMap = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5));
    }

    // Step 4: Create card geometry (default: 3.5" x 2" Traditional, 16pt)
    this.cardGeometry = new CardGeometry({
      width: this.width,
      height: this.height,
      thickness: this.thickness,
      cornerRadius: this.cornerRadius
    });

    // Step 5: Create material via MaterialPipeline
    this.material = MaterialPipeline.createCardMaterial({
      artwork: artworkTexture,
      foilMask: foilMask,
      uvMask: uvMask,
      embossMap: embossHeightMap
    });

    // Step 6: Combine into mesh and add to scene
    this.cardMesh = new THREE.Mesh(this.cardGeometry.geometry, this.material);
    this.engineController.add(this.cardMesh);

    // Step 7: Start render loop
    this.engineController.start();

    // Phase 2: Initialize ConfiguratorController and EngineBridge
    this.configController = new ConfiguratorController();
    this.engineBridge = new EngineBridge(this.configController, this.material);

    // Register material for lighting updates
    this.engineController.registerMaterialForLighting(this.material);

    // Set up update loop for material uniforms
    this.setupUpdateLoop();

    // Set up UI and controls
    this.setupUI();
    this.setupEventListeners();
    this.setupPhase2EventListeners(); // Phase 2: New event listeners
    this.updatePrice();
    this.showStep('size');

    // Expose global functions for development controls
    this.exposeGlobalControls();

    console.log('Test Harness initialized successfully');
  }

  /**
   * Set up update loop for material uniforms
   * Updates lighting uniforms each frame to reflect scene lighting changes
   */
  private setupUpdateLoop(): void {
    // Update lighting uniforms in the engine's render loop
    // This will be called from EngineController's update method
    // For now, we'll update it once and then rely on EngineController to update it
    if (this.engineController && this.material) {
      const lightingInfo = this.engineController.getLightingInfo();
      MaterialPipeline.updateLighting(this.material, lightingInfo);
    }
  }

  /**
   * Expose global functions for development controls
   */
  private exposeGlobalControls(): void {
    // Global functions for changing dimensions
    (window as any).setCardWidth = (width: number) => {
      this.width = width;
      this.updateDimensions();
      if (this.widthSlider) {
        this.widthSlider.value = width.toString();
        this.updateValueDisplay('width-value', `${width} mm`);
      }
    };

    (window as any).setCardHeight = (height: number) => {
      this.height = height;
      this.updateDimensions();
      if (this.heightSlider) {
        this.heightSlider.value = height.toString();
        this.updateValueDisplay('height-value', `${height} mm`);
      }
    };

    (window as any).setCardThickness = (thickness: number) => {
      this.thickness = thickness;
      this.updateDimensions();
      // Update thickness option selection
      if (this.thicknessOptions) {
        this.thicknessOptions.forEach(option => {
          const optionThickness = parseFloat(option.getAttribute('data-thickness') || '0');
          if (Math.abs(optionThickness - thickness) < 0.1) {
            this.thicknessOptions!.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
          }
        });
      }
    };

    (window as any).setCardCornerRadius = (radius: number) => {
      this.cornerRadius = radius;
      this.updateDimensions();
      if (this.cornerRadiusSlider) {
        this.cornerRadiusSlider.value = radius.toString();
        this.updateValueDisplay('corner-radius-value', `${radius} mm`);
      }
    };

    // Global functions for toggling layers
    // Note: With new shader structure, layers are always active based on mask values
    // Toggles can be implemented by swapping between mask texture and black texture
    (window as any).toggleFoil = (enabled?: boolean) => {
      // Layer effects are controlled by mask textures
      // For now, just update UI state
      if (this.foilToggle) {
        const newState = enabled !== undefined ? enabled : !this.foilToggle.classList.contains('active');
        if (newState) {
          this.foilToggle.classList.add('active');
        } else {
          this.foilToggle.classList.remove('active');
        }
      }
      this.updatePrice();
    };

    (window as any).toggleUV = (enabled?: boolean) => {
      if (this.uvToggle) {
        const newState = enabled !== undefined ? enabled : !this.uvToggle.classList.contains('active');
        if (newState) {
          this.uvToggle.classList.add('active');
        } else {
          this.uvToggle.classList.remove('active');
        }
      }
      this.updatePrice();
    };

    (window as any).toggleEmboss = (enabled?: boolean) => {
      if (this.embossToggle) {
        const newState = enabled !== undefined ? enabled : !this.embossToggle.classList.contains('active');
        if (newState) {
          this.embossToggle.classList.add('active');
        } else {
          this.embossToggle.classList.remove('active');
        }
      }
      this.updatePrice();
    };

    // Expose CardGeometry instance globally for debugging
    (window as any).card = this.cardGeometry;
    (window as any).cardMesh = this.cardMesh;

    console.log('Global controls exposed:');
    console.log('  setCardWidth(width), setCardHeight(height), setCardThickness(thickness), setCardCornerRadius(radius)');
    console.log('  toggleFoil(enabled?), toggleUV(enabled?), toggleEmboss(enabled?)');
    console.log('  window.card - CardGeometry instance');
    console.log('  window.cardMesh - THREE.Mesh instance');
  }

  /**
   * Set up UI elements
   */
  private setupUI(): void {
    this.previewPanel = document.getElementById('preview-panel');
    this.fullscreenBtn = document.getElementById('fullscreen-btn');
    this.screenshotBtn = document.getElementById('screenshot-btn');
    this.viewModeSelect = document.getElementById('view-mode-select') as HTMLSelectElement;
    this.stepButtons = document.querySelectorAll('.step-btn');
    this.configSections = document.querySelectorAll('.config-section');
    this.priceDisplay = document.getElementById('total-price');
    this.addToCartBtn = document.getElementById('add-to-cart-btn');

    // Size options
    this.sizeOptionCards = document.querySelectorAll('.size-option-card');
    this.customSizeToggle = document.getElementById('custom-size-toggle');
    this.customSizeControls = document.getElementById('custom-size-controls');

    // Sliders (for custom size)
    this.widthSlider = document.getElementById('width-slider') as HTMLInputElement;
    this.heightSlider = document.getElementById('height-slider') as HTMLInputElement;
    this.cornerRadiusSlider = document.getElementById('corner-radius-slider') as HTMLInputElement;

    // Thickness options
    this.thicknessOptions = document.querySelectorAll('.thickness-option');

    // Layer toggles
    this.foilToggle = document.getElementById('foil-toggle');
    this.uvToggle = document.getElementById('uv-toggle');
    this.embossToggle = document.getElementById('emboss-toggle');

    // Option items
    this.materialOptions = document.querySelectorAll('[data-step="material"] .option-item');
    this.colorSwatches = document.querySelectorAll('.color-swatch');
    this.finishOptions = document.querySelectorAll('[data-step="finish"] .option-item');

    // Set initial slider values (for custom size)
    if (this.widthSlider) this.widthSlider.value = this.width.toString();
    if (this.heightSlider) this.heightSlider.value = this.height.toString();
    if (this.cornerRadiusSlider) this.cornerRadiusSlider.value = this.cornerRadius.toString();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Fullscreen toggle
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    // Screenshot button
    if (this.screenshotBtn) {
      this.screenshotBtn.addEventListener('click', () => this.takeScreenshot());
    }

    // View mode selector (lighting preset)
    if (this.viewModeSelect) {
      this.viewModeSelect.addEventListener('change', (e) => {
        const preset = (e.target as HTMLSelectElement).value;
        if (this.engineController) {
          this.engineController.setLightingPreset(preset as any);
        }
      });
    }

    // Step navigation
    if (this.stepButtons) {
      this.stepButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const step = btn.getAttribute('data-step');
          if (step) {
            this.showStep(step);
          }
        });
      });
    }

    // Size option cards
    if (this.sizeOptionCards) {
      this.sizeOptionCards.forEach(card => {
        card.addEventListener('click', () => {
          // Deselect all cards
          this.sizeOptionCards!.forEach(c => c.classList.remove('selected'));
          // Select clicked card
          card.classList.add('selected');
          
          // Get dimensions from data attributes
          const width = parseFloat(card.getAttribute('data-width') || '88.9');
          const height = parseFloat(card.getAttribute('data-height') || '50.8');
          
          this.width = width;
          this.height = height;
          this.isCustomSize = false;
          
          // Hide custom controls
          if (this.customSizeControls) {
            this.customSizeControls.style.display = 'none';
          }
          
          this.updateDimensions();
          this.updatePrice();
        });
      });
    }

    // Custom size toggle
    if (this.customSizeToggle) {
      this.customSizeToggle.addEventListener('click', () => {
        // Deselect all size option cards
        if (this.sizeOptionCards) {
          this.sizeOptionCards.forEach(card => card.classList.remove('selected'));
        }
        
        // Toggle custom controls visibility
        if (this.customSizeControls) {
          const isVisible = this.customSizeControls.style.display !== 'none';
          this.customSizeControls.style.display = isVisible ? 'none' : 'block';
          this.isCustomSize = !isVisible;
          
          // If enabling custom size, update sliders to current values
          if (!isVisible) {
            if (this.widthSlider) this.widthSlider.value = this.width.toString();
            if (this.heightSlider) this.heightSlider.value = this.height.toString();
            if (this.cornerRadiusSlider) this.cornerRadiusSlider.value = this.cornerRadius.toString();
            this.updateValueDisplay('width-value', `${this.width} mm`);
            this.updateValueDisplay('height-value', `${this.height} mm`);
            this.updateValueDisplay('corner-radius-value', `${this.cornerRadius} mm`);
          }
        }
      });
    }

    // Custom size sliders (only active when custom size is enabled)
    if (this.widthSlider) {
      this.widthSlider.addEventListener('input', () => {
        if (this.isCustomSize) {
          this.width = parseFloat(this.widthSlider!.value);
          this.updateDimensions();
          this.updateValueDisplay('width-value', `${this.width} mm`);
          this.updatePrice();
        }
      });
    }

    if (this.heightSlider) {
      this.heightSlider.addEventListener('input', () => {
        if (this.isCustomSize) {
          this.height = parseFloat(this.heightSlider!.value);
          this.updateDimensions();
          this.updateValueDisplay('height-value', `${this.height} mm`);
          this.updatePrice();
        }
      });
    }

    // Corner radius slider (independent of custom size - always active)
    if (this.cornerRadiusSlider) {
      this.cornerRadiusSlider.addEventListener('input', () => {
        this.cornerRadius = parseFloat(this.cornerRadiusSlider!.value);
        this.updateDimensions();
        this.updateValueDisplay('corner-radius-value', `${this.cornerRadius} mm`);
      });
    }

    // Thickness options
    if (this.thicknessOptions) {
      this.thicknessOptions.forEach(option => {
        option.addEventListener('click', () => {
          // Deselect all thickness options
          this.thicknessOptions!.forEach(opt => opt.classList.remove('selected'));
          // Select clicked option
          option.classList.add('selected');
          
          // Get thickness from data attribute (in mm)
          const thickness = parseFloat(option.getAttribute('data-thickness') || '5.6444');
          this.thickness = thickness/10;
          
          this.updateDimensions();
          this.updatePrice();
        });
      });
    }

    // Layer toggles
    if (this.foilToggle) {
      this.foilToggle.addEventListener('click', () => {
        (window as any).toggleFoil();
      });
    }

    if (this.uvToggle) {
      this.uvToggle.addEventListener('click', () => {
        (window as any).toggleUV();
      });
    }

    if (this.embossToggle) {
      this.embossToggle.addEventListener('click', () => {
        (window as any).toggleEmboss();
      });
    }

    // Material options
    if (this.materialOptions) {
      this.materialOptions.forEach(option => {
        option.addEventListener('click', () => {
          this.materialOptions!.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          this.updatePrice();
        });
      });
    }

    // Color swatches
    if (this.colorSwatches) {
      this.colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
          // Update UI selection
          this.colorSwatches!.forEach(s => s.classList.remove('selected'));
          swatch.classList.add('selected');
          
          // Deselect custom color swatch if it was selected
          const customColorSwatch = document.getElementById('custom-color-swatch');
          if (customColorSwatch) {
            customColorSwatch.classList.remove('selected');
          }
          
          // Get color from swatch's style attribute
          const swatchEl = swatch as HTMLElement;
          const styleAttr = swatchEl.getAttribute('style');
          
          if (styleAttr) {
            // Parse hex color from style attribute (format: "background: #8B4513;")
            const match = styleAttr.match(/background:\s*(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3})/);
            if (match && match[1]) {
              const hexColor = match[1];
              MaterialPipeline.updateBaseColor(this.material, hexColor);
              console.log('Card color updated to:', hexColor);
              
              // Update custom color picker value to match
              if (customColorPicker) {
                customColorPicker.value = hexColor;
              }
            } else {
              // Try to get computed style as fallback
              const computed = window.getComputedStyle(swatchEl);
              const bgColor = computed.backgroundColor;
              if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                MaterialPipeline.updateBaseColor(this.material, bgColor);
                console.log('Card color updated to:', bgColor);
              }
            }
          }
        });
      });
    }

    // Custom color picker (rainbow swatch)
    const customColorPicker = document.getElementById('custom-color-picker') as HTMLInputElement;
    const customColorSwatch = document.getElementById('custom-color-swatch');
    
    if (customColorPicker && customColorSwatch) {
      customColorPicker.addEventListener('input', (e) => {
        const color = (e.target as HTMLInputElement).value;
        
        // Deselect all predefined swatches
        if (this.colorSwatches) {
          this.colorSwatches.forEach(s => {
            if (!s.classList.contains('custom-color-swatch')) {
              s.classList.remove('selected');
            }
          });
        }
        
        // Select custom color swatch
        customColorSwatch.classList.add('selected');
        
        // Update card color
        MaterialPipeline.updateBaseColor(this.material, color);
        console.log('Card color updated to custom color:', color);
      });
      
      // When custom swatch is clicked, also handle selection state
      customColorSwatch.addEventListener('click', (e) => {
        // If clicking on the swatch itself (not the input), trigger the input click
        if (e.target === customColorSwatch || (e.target as HTMLElement).classList.contains('rainbow-gradient')) {
          customColorPicker.click();
        }
      });
    }

    // Finish options
    if (this.finishOptions) {
      this.finishOptions.forEach(option => {
        option.addEventListener('click', () => {
          this.finishOptions!.forEach(opt => opt.classList.remove('selected'));
          option.classList.add('selected');
          this.updatePrice();
        });
      });
    }

    // Add to cart button
    if (this.addToCartBtn) {
      this.addToCartBtn.addEventListener('click', () => {
        console.log('Add to cart clicked');
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.previewPanel?.classList.contains('fullscreen')) {
        this.toggleFullscreen();
      }
    });

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());

    // Listen for panel resize (when divider is dragged)
    window.addEventListener('resize', () => {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        this.engineController.resize();
      }, 50);
    });
  }

  /**
   * Handle fullscreen change events
   */
  private handleFullscreenChange(): void {
    const isFullscreen = document.fullscreenElement !== null || 
                        (document as any).webkitFullscreenElement !== null ||
                        (document as any).mozFullScreenElement !== null ||
                        (document as any).msFullscreenElement !== null;

    if (this.previewPanel) {
      if (isFullscreen) {
        this.previewPanel.classList.add('fullscreen');
      } else {
        this.previewPanel.classList.remove('fullscreen');
      }
      setTimeout(() => {
        this.engineController.resize();
      }, 100);
    }
  }

  /**
   * Toggle fullscreen mode
   */
  private toggleFullscreen(): void {
    if (!this.previewPanel) return;

    const isFullscreen = document.fullscreenElement !== null || 
                        (document as any).webkitFullscreenElement !== null ||
                        (document as any).mozFullScreenElement !== null ||
                        (document as any).msFullscreenElement !== null;

    if (isFullscreen || this.previewPanel.classList.contains('fullscreen')) {
      this.previewPanel.classList.remove('fullscreen');
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    } else {
      this.previewPanel.classList.add('fullscreen');
      const element = this.previewPanel as any;
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    }

    setTimeout(() => {
      this.engineController.resize();
    }, 100);
  }

  /**
   * Take screenshot
   */
  private takeScreenshot(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `card-preview-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }

  /**
   * Show specific configuration step
   */
  private showStep(step: string): void {
    // Re-query elements if they're not available (defensive check)
    if (!this.stepButtons || this.stepButtons.length === 0) {
      this.stepButtons = document.querySelectorAll('.step-btn');
    }
    if (!this.configSections || this.configSections.length === 0) {
      this.configSections = document.querySelectorAll('.config-section');
    }

    if (this.stepButtons) {
      this.stepButtons.forEach(btn => {
        if (btn.getAttribute('data-step') === step) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    if (this.configSections) {
      this.configSections.forEach(section => {
        const sectionStep = section.getAttribute('data-step');
        if (sectionStep === step) {
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
        }
      });
    } else {
      console.warn('Config sections not found when trying to show step:', step);
    }
  }

  /**
   * Update card dimensions
   */
  private updateDimensions(): void {
    console.log('[TestHarness] Updating dimensions:', {
      width: this.width,
      height: this.height,
      thickness: this.thickness,
      cornerRadius: this.cornerRadius
    });

    // Update geometry
    this.cardGeometry.updateDimensions(
      this.width,
      this.height,
      this.thickness,
      this.cornerRadius
    );

    // Verify mesh is using the correct geometry
    if (this.cardMesh.geometry !== this.cardGeometry.geometry) {
      console.warn('[TestHarness] Mesh geometry mismatch! Updating mesh reference...');
      this.cardMesh.geometry.dispose();
      this.cardMesh.geometry = this.cardGeometry.geometry;
    }

    // Verify geometry attributes are updated
    const positionAttr = this.cardMesh.geometry.getAttribute('position');
    if (positionAttr) {
      console.log('[TestHarness] Position attribute updated:', {
        count: positionAttr.count,
        needsUpdate: positionAttr.needsUpdate,
        firstVertex: [
          positionAttr.getX(0),
          positionAttr.getY(0),
          positionAttr.getZ(0)
        ]
      });
    }
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
   * Update price display
   */
  private updatePrice(): void {
    if (!this.priceDisplay) return;

    let price = this.basePrice;

    const selectedMaterial = document.querySelector('[data-step="material"] .option-item.selected');
    if (selectedMaterial) {
      const priceText = selectedMaterial.querySelector('.option-item-price')?.textContent || '£0.00';
      const materialPrice = parseFloat(priceText.replace(/[£+]/g, '')) || 0;
      price += materialPrice;
    }

    if (this.foilToggle?.classList.contains('active')) {
      price += 10;
    }
    if (this.uvToggle?.classList.contains('active')) {
      price += 5;
    }
    if (this.embossToggle?.classList.contains('active')) {
      price += 15;
    }

    this.priceDisplay.textContent = `£${price.toFixed(2)}`;
  }

  /**
   * Phase 2: Set up event listeners for configurator controls
   */
  private setupPhase2EventListeners(): void {
    // Foil controls
    const foilEnabled = document.getElementById('foil-enabled') as HTMLInputElement;
    const foilOptions = document.getElementById('foil-options');
    const foilColorOptions = document.querySelectorAll('.foil-color-option');
    const foilTypeOptions = document.querySelectorAll('#foil-options .option-item[data-type]');
    const foilSideCheckboxes = document.querySelectorAll('#foil-options .side-checkboxes input[type="checkbox"]');
    const foilMaskUpload = document.getElementById('foil-mask-upload') as HTMLInputElement;
    const foilMaskFilename = document.getElementById('foil-mask-filename');

    if (foilEnabled && foilOptions) {
      foilEnabled.addEventListener('change', () => {
        const enabled = foilEnabled.checked;
        foilOptions.style.display = enabled ? 'block' : 'none';
        
        const sides: LayerSide[] = [];
        foilSideCheckboxes.forEach((cb: Element) => {
          const checkbox = cb as HTMLInputElement;
          if (checkbox.checked) {
            const side = checkbox.getAttribute('data-side') as LayerSide;
            if (side) sides.push(side);
          }
        });
        
        this.configController.setFoilEnabled(sides, enabled);
        this.updatePrice();
      });
    }

    foilColorOptions.forEach(option => {
      option.addEventListener('click', () => {
        foilColorOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        const color = option.getAttribute('data-color');
        if (color) {
          this.configController.setFoilColor(color as any);
        }
      });
    });

    foilTypeOptions.forEach(option => {
      option.addEventListener('click', () => {
        foilTypeOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        const type = option.getAttribute('data-type');
        if (type) {
          this.configController.setFoilType(type as any);
        }
      });
    });

    if (foilSideCheckboxes.length > 0) {
      foilSideCheckboxes.forEach((cb: Element) => {
        const checkbox = cb as HTMLInputElement;
        checkbox.addEventListener('change', () => {
          const sides: LayerSide[] = [];
          foilSideCheckboxes.forEach((c: Element) => {
            const chk = c as HTMLInputElement;
            if (chk.checked) {
              const side = chk.getAttribute('data-side') as LayerSide;
              if (side) sides.push(side);
            }
          });
          if (foilEnabled?.checked) {
            this.configController.setFoilEnabled(sides, true);
          }
        });
      });
    }

    if (foilMaskUpload) {
      foilMaskUpload.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          this.configController.setFoilCustomMask('front', url);
          if (foilMaskFilename) {
            foilMaskFilename.textContent = file.name;
          }
        }
      });
    }

    // UV controls
    const uvEnabled = document.getElementById('uv-enabled') as HTMLInputElement;
    const uvOptions = document.getElementById('uv-options');
    const uvTypeOptions = document.querySelectorAll('#uv-options .option-item[data-type]');
    const uvSideCheckboxes = document.querySelectorAll('#uv-options .side-checkboxes input[type="checkbox"]');
    const uvMaskUpload = document.getElementById('uv-mask-upload') as HTMLInputElement;
    const uvMaskFilename = document.getElementById('uv-mask-filename');

    if (uvEnabled && uvOptions) {
      uvEnabled.addEventListener('change', () => {
        const enabled = uvEnabled.checked;
        uvOptions.style.display = enabled ? 'block' : 'none';
        
        const sides: LayerSide[] = [];
        uvSideCheckboxes.forEach((cb: Element) => {
          const checkbox = cb as HTMLInputElement;
          if (checkbox.checked) {
            const side = checkbox.getAttribute('data-side') as LayerSide;
            if (side) sides.push(side);
          }
        });
        
        this.configController.setUVEnabled(sides, enabled);
        this.updatePrice();
      });
    }

    uvTypeOptions.forEach(option => {
      option.addEventListener('click', () => {
        uvTypeOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        const type = option.getAttribute('data-type');
        if (type) {
          this.configController.setUVType(type as any);
        }
      });
    });

    if (uvMaskUpload) {
      uvMaskUpload.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          this.configController.setUVCustomMask('front', url);
          if (uvMaskFilename) {
            uvMaskFilename.textContent = file.name;
          }
        }
      });
    }

    // Emboss controls
    const embossEnabled = document.getElementById('emboss-enabled') as HTMLInputElement;
    const embossOptions = document.getElementById('emboss-options');
    const embossModeOptions = document.querySelectorAll('#emboss-options .option-item[data-mode]');
    const embossSideCheckboxes = document.querySelectorAll('#emboss-options .side-checkboxes input[type="checkbox"]');
    const embossHeightMapUpload = document.getElementById('emboss-heightmap-upload') as HTMLInputElement;
    const embossHeightMapFilename = document.getElementById('emboss-heightmap-filename');

    if (embossEnabled && embossOptions) {
      embossEnabled.addEventListener('change', () => {
        const enabled = embossEnabled.checked;
        embossOptions.style.display = enabled ? 'block' : 'none';
        
        const sides: LayerSide[] = [];
        embossSideCheckboxes.forEach((cb: Element) => {
          const checkbox = cb as HTMLInputElement;
          if (checkbox.checked) {
            const side = checkbox.getAttribute('data-side') as LayerSide;
            if (side) sides.push(side);
          }
        });
        
        this.configController.setEmbossEnabled(sides, enabled);
        this.updatePrice();
      });
    }

    embossModeOptions.forEach(option => {
      option.addEventListener('click', () => {
        embossModeOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        const mode = option.getAttribute('data-mode');
        if (mode) {
          this.configController.setEmbossMode(mode as any);
        }
      });
    });

    if (embossHeightMapUpload) {
      embossHeightMapUpload.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          this.configController.setEmbossHeightMap('front', url);
          if (embossHeightMapFilename) {
            embossHeightMapFilename.textContent = file.name;
          }
        }
      });
    }

    // Die Cut controls
    const diecutEnabled = document.getElementById('diecut-enabled') as HTMLInputElement;
    const diecutOptions = document.getElementById('diecut-options');
    const diecutTypeOptions = document.querySelectorAll('#diecut-options .option-item[data-type]');
    const diecutMaskUpload = document.getElementById('diecut-mask-upload') as HTMLInputElement;
    const diecutMaskFilename = document.getElementById('diecut-mask-filename');

    if (diecutEnabled && diecutOptions) {
      diecutEnabled.addEventListener('change', () => {
        const enabled = diecutEnabled.checked;
        diecutOptions.style.display = enabled ? 'block' : 'none';
        // Die cut doesn't affect material pipeline in Phase 2
        this.updatePrice();
      });
    }

    // Edge controls
    const edgesEnabled = document.getElementById('edges-enabled') as HTMLInputElement;
    const edgesOptions = document.getElementById('edges-options');
    const edgeCountOptions = document.querySelectorAll('#edges-options .option-item[data-count]');
    const edgeInkTypeOptions = document.querySelectorAll('#edges-options .option-item[data-inktype]');
    const edgeColorPicker = document.getElementById('edge-color-picker') as HTMLInputElement;
    const foilEdgesCheckbox = document.getElementById('foil-edges-checkbox') as HTMLInputElement;

    if (edgesEnabled && edgesOptions) {
      edgesEnabled.addEventListener('change', () => {
        const enabled = edgesEnabled.checked;
        edgesOptions.style.display = enabled ? 'block' : 'none';
        this.configController.setEdgeEnabled(enabled);
        this.updatePrice();
      });
    }

    edgeCountOptions.forEach(option => {
      option.addEventListener('click', () => {
        edgeCountOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        const count = parseInt(option.getAttribute('data-count') || '0');
        this.configController.setEdgeCount(count as any);
      });
    });

    if (edgeColorPicker) {
      edgeColorPicker.addEventListener('change', () => {
        this.configController.setEdgeColor(edgeColorPicker.value);
      });
    }

    if (foilEdgesCheckbox) {
      foilEdgesCheckbox.addEventListener('change', () => {
        this.configController.setFoilEdges(foilEdgesCheckbox.checked);
      });
    }

    // Extras controls
    const pmsInkCheckbox = document.getElementById('pms-ink-checkbox') as HTMLInputElement;
    const perforateCheckbox = document.getElementById('perforate-checkbox') as HTMLInputElement;
    const variableDataCheckbox = document.getElementById('variable-data-checkbox') as HTMLInputElement;
    const variableDataText = document.getElementById('variable-data-text') as HTMLInputElement;
    const qrCodeCheckbox = document.getElementById('qr-code-checkbox') as HTMLInputElement;

    if (pmsInkCheckbox) {
      pmsInkCheckbox.addEventListener('change', () => {
        this.configController.setPMSInk(pmsInkCheckbox.checked);
        this.updatePrice();
      });
    }

    if (perforateCheckbox) {
      perforateCheckbox.addEventListener('change', () => {
        this.configController.setPerforate(perforateCheckbox.checked);
        this.updatePrice();
      });
    }

    if (variableDataCheckbox) {
      variableDataCheckbox.addEventListener('change', () => {
        const enabled = variableDataCheckbox.checked;
        if (variableDataText) {
          variableDataText.style.display = enabled ? 'block' : 'none';
        }
        this.configController.setVariableData(enabled, variableDataText?.value);
      });
    }

    if (variableDataText) {
      variableDataText.addEventListener('input', () => {
        if (variableDataCheckbox?.checked) {
          this.configController.setVariableData(true, variableDataText.value);
        }
      });
    }

    if (qrCodeCheckbox) {
      qrCodeCheckbox.addEventListener('change', () => {
        this.configController.setQRCode(qrCodeCheckbox.checked);
        this.updatePrice();
      });
    }

    // Artwork uploads
    const frontArtworkUpload = document.getElementById('front-artwork-upload') as HTMLInputElement;
    const frontArtworkFilename = document.getElementById('front-artwork-filename');
    const backArtworkUpload = document.getElementById('back-artwork-upload') as HTMLInputElement;
    const backArtworkFilename = document.getElementById('back-artwork-filename');

    if (frontArtworkUpload) {
      frontArtworkUpload.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          this.configController.setArtwork('front', url);
          if (frontArtworkFilename) {
            frontArtworkFilename.textContent = file.name;
          }
        }
      });
    }

    if (backArtworkUpload) {
      backArtworkUpload.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          this.configController.setArtwork('back', url);
          if (backArtworkFilename) {
            backArtworkFilename.textContent = file.name;
          }
        }
      });
    }

    // Preset buttons
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.getAttribute('data-preset');
        if (preset) {
          this.configController.setPreset(preset as any);
          // Update UI to reflect preset
          this.syncUIWithConfig();
          this.updatePrice();
        }
      });
    });
  }

  /**
   * Sync UI state with current configuration
   */
  private syncUIWithConfig(): void {
    const state = this.configController.getState();
    // This method can be expanded to update all UI elements based on config state
    // For now, it's a placeholder for future enhancement
  }

  /**
   * Dispose of test harness
   */
  dispose(): void {
    // Cleanup handled by browser
  }
}
