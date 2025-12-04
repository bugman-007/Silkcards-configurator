import { CardGeometry } from '../engine/CardGeometry.js';
import { MaterialPipeline } from '../engine/MaterialPipeline.js';
import { EngineController } from '../engine/EngineController.js';

/**
 * Configurator UI Controller
 * Manages the configurator panel UI and interactions
 */
export class TestHarness {
  private cardGeometry: CardGeometry;
  private materialPipeline: MaterialPipeline;
  private engineController: EngineController;

  // Current values
  private width: number = 85;
  private height: number = 55;
  private thickness: number = 0.3;
  private cornerRadius: number = 3;
  private basePrice: number = 0;

  // UI Elements
  private previewPanel: HTMLElement | null = null;
  private fullscreenBtn: HTMLElement | null = null;
  private screenshotBtn: HTMLElement | null = null;
  private stepButtons: NodeListOf<HTMLElement> | null = null;
  private configSections: NodeListOf<HTMLElement> | null = null;
  private priceDisplay: HTMLElement | null = null;
  private addToCartBtn: HTMLElement | null = null;

  // Sliders
  private widthSlider: HTMLInputElement | null = null;
  private heightSlider: HTMLInputElement | null = null;
  private thicknessSlider: HTMLInputElement | null = null;
  private cornerRadiusSlider: HTMLInputElement | null = null;

  // Layer toggles
  private foilToggle: HTMLElement | null = null;
  private uvToggle: HTMLElement | null = null;
  private embossToggle: HTMLElement | null = null;

  // Option items
  private materialOptions: NodeListOf<HTMLElement> | null = null;
  private colorSwatches: NodeListOf<HTMLElement> | null = null;
  private finishOptions: NodeListOf<HTMLElement> | null = null;

  constructor(
    cardGeometry: CardGeometry,
    materialPipeline: MaterialPipeline,
    engineController: EngineController
  ) {
    this.cardGeometry = cardGeometry;
    this.materialPipeline = materialPipeline;
    this.engineController = engineController;

    this.setupUI();
    this.setupEventListeners();
    this.updatePrice();
    
    // Show initial step
    this.showStep('size');
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

    // Sliders
    this.widthSlider = document.getElementById('width-slider') as HTMLInputElement;
    this.heightSlider = document.getElementById('height-slider') as HTMLInputElement;
    this.thicknessSlider = document.getElementById('thickness-slider') as HTMLInputElement;
    this.cornerRadiusSlider = document.getElementById('corner-radius-slider') as HTMLInputElement;

    // Layer toggles
    this.foilToggle = document.getElementById('foil-toggle');
    this.uvToggle = document.getElementById('uv-toggle');
    this.embossToggle = document.getElementById('emboss-toggle');

    // Option items
    this.materialOptions = document.querySelectorAll('[data-step="material"] .option-item');
    this.colorSwatches = document.querySelectorAll('.color-swatch');
    this.finishOptions = document.querySelectorAll('[data-step="finish"] .option-item');
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

    // Dimension sliders
    if (this.widthSlider) {
      this.widthSlider.addEventListener('input', () => {
        this.width = parseFloat(this.widthSlider!.value);
        this.updateDimensions();
        this.updateValueDisplay('width-value', `${this.width} mm`);
        this.updatePrice();
      });
    }

    if (this.heightSlider) {
      this.heightSlider.addEventListener('input', () => {
        this.height = parseFloat(this.heightSlider!.value);
        this.updateDimensions();
        this.updateValueDisplay('height-value', `${this.height} mm`);
        this.updatePrice();
      });
    }

    if (this.thicknessSlider) {
      this.thicknessSlider.addEventListener('input', () => {
        this.thickness = parseFloat(this.thicknessSlider!.value);
        this.updateDimensions();
        this.updateValueDisplay('thickness-value', `${this.thickness} mm`);
        this.updatePrice();
      });
    }

    if (this.cornerRadiusSlider) {
      this.cornerRadiusSlider.addEventListener('input', () => {
        this.cornerRadius = parseFloat(this.cornerRadiusSlider!.value);
        this.updateDimensions();
        this.updateValueDisplay('corner-radius-value', `${this.cornerRadius} mm`);
      });
    }

    // Layer toggles
    if (this.foilToggle) {
      this.foilToggle.addEventListener('click', () => {
        const isActive = this.foilToggle!.classList.contains('active');
        this.materialPipeline.toggleFoil(!isActive);
        this.foilToggle!.classList.toggle('active');
        this.updatePrice();
      });
    }

    if (this.uvToggle) {
      this.uvToggle.addEventListener('click', () => {
        const isActive = this.uvToggle!.classList.contains('active');
        this.materialPipeline.toggleUV(!isActive);
        this.uvToggle!.classList.toggle('active');
        this.updatePrice();
      });
    }

    if (this.embossToggle) {
      this.embossToggle.addEventListener('click', () => {
        const isActive = this.embossToggle!.classList.contains('active');
        this.materialPipeline.toggleEmboss(!isActive);
        this.embossToggle!.classList.toggle('active');
        this.updatePrice();
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
          // TODO: Apply color to material
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
        // TODO: Implement add to cart functionality
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      // Escape to exit fullscreen
      if (event.key === 'Escape' && this.previewPanel?.classList.contains('fullscreen')) {
        this.toggleFullscreen();
      }
    });

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());
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
      // Resize canvas
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
      // Exit fullscreen
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
      // Enter fullscreen
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

    // Resize canvas after a short delay
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
    // Update step buttons
    if (this.stepButtons) {
      this.stepButtons.forEach(btn => {
        if (btn.getAttribute('data-step') === step) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Show/hide sections
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

    // Add material price
    const selectedMaterial = document.querySelector('[data-step="material"] .option-item.selected');
    if (selectedMaterial) {
      const priceText = selectedMaterial.querySelector('.option-item-price')?.textContent || '£0.00';
      const materialPrice = parseFloat(priceText.replace(/[£+]/g, '')) || 0;
      price += materialPrice;
    }

    // Add layer prices (placeholder)
    if (this.foilToggle?.classList.contains('active')) {
      price += 10; // Foil layer
    }
    if (this.uvToggle?.classList.contains('active')) {
      price += 5; // UV layer
    }
    if (this.embossToggle?.classList.contains('active')) {
      price += 15; // Emboss layer
    }

    // Add finish price
    const selectedFinish = document.querySelector('[data-step="finish"] .option-item.selected');
    if (selectedFinish) {
      // Finish pricing logic if needed
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
