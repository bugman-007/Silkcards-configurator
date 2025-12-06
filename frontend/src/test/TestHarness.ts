import * as THREE from 'three';
import { EngineController } from '../engine/EngineController.js';
import { CardGeometry } from '../engine/CardGeometry.js';
import { MaterialPipeline } from '../engine/MaterialPipeline.js';
import { ResourceManager } from '../resources/ResourceManager.js';

/**
 * Test Harness
 * Development controls and initialization for the 3D card engine
 */
export class TestHarness {
  private engineController: EngineController;
  private cardGeometry: CardGeometry;
  private material: THREE.ShaderMaterial;
  private cardMesh: THREE.Mesh;

  // Current values
  private width: number = 88.9; // 3.5" in mm (default: Traditional)
  private height: number = 50.8; // 2" in mm
  private thickness: number = 5.64; // 16pt in mm (default)
  private cornerRadius: number = 5;
  private isCustomSize: boolean = false;

  // UI Elements
  private previewPanel: HTMLElement | null = null;
  private fullscreenBtn: HTMLElement | null = null;
  private screenshotBtn: HTMLElement | null = null;
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

    // Set up update loop for material uniforms
    this.setupUpdateLoop();

    // Set up UI and controls
    this.setupUI();
    this.setupEventListeners();
    this.updatePrice();
    this.showStep('size');

    // Expose global functions for development controls
    this.exposeGlobalControls();

    console.log('Test Harness initialized successfully');
  }

  /**
   * Set up update loop for material uniforms
   * Note: No uniforms need per-frame updates with the new shader structure
   */
  private setupUpdateLoop(): void {
    // No per-frame uniform updates needed
    // All uniforms are set once and updated only when user changes settings
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

    console.log('Global controls exposed:');
    console.log('  setCardWidth(width), setCardHeight(height), setCardThickness(thickness), setCardCornerRadius(radius)');
    console.log('  toggleFoil(enabled?), toggleUV(enabled?), toggleEmboss(enabled?)');
  }

  /**
   * Set up UI elements
   */
  private setupUI(): void {
    this.previewPanel = document.getElementById('preview-panel');
    this.fullscreenBtn = document.getElementById('fullscreen-btn');
    this.screenshotBtn = document.getElementById('screenshot-btn');
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

    if (this.cornerRadiusSlider) {
      this.cornerRadiusSlider.addEventListener('input', () => {
        if (this.isCustomSize) {
          this.cornerRadius = parseFloat(this.cornerRadiusSlider!.value);
          this.updateDimensions();
          this.updateValueDisplay('corner-radius-value', `${this.cornerRadius} mm`);
        }
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
          const thickness = parseFloat(option.getAttribute('data-thickness') || '5.64');
          this.thickness = thickness;
          
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
          this.colorSwatches!.forEach(s => s.classList.remove('selected'));
          swatch.classList.add('selected');
        });
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
        if (section.getAttribute('data-step') === step) {
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
        }
      });
    }
  }

  /**
   * Update card dimensions
   */
  private updateDimensions(): void {
    this.cardGeometry.updateDimensions(
      this.width,
      this.height,
      this.thickness,
      this.cornerRadius
    );
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
   * Dispose of test harness
   */
  dispose(): void {
    // Cleanup handled by browser
  }
}
