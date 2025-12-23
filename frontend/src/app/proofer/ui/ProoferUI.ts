/**
 * Proofer UI Controller
 * 
 * Manages viewport initialization and rendering from ProoferState
 */

import * as THREE from 'three';
import { EngineController } from '../engine/EngineController.js';
import { CardGeometry } from '../geometry/CardGeometry.js';
import { MaterialPipeline } from '../materials/MaterialPipeline.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { ProoferController } from '../state/ProoferController.js';
import { EngineBridge } from '../bridge/EngineBridge.js';

/**
 * Proofer UI Controller
 * 
 * Manages viewport and rendering - ONLY uses ProoferState
 */
export class ProoferUI {
  private engineController: EngineController;
  private cardGeometry: CardGeometry;
  private material: THREE.ShaderMaterial;
  private cardMesh: THREE.Mesh;
  private prooferController: ProoferController;
  private engineBridge: EngineBridge;
  private canvasContainer: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Initialize the proofer UI
   */
  static async init(canvasContainer: HTMLElement, controller: ProoferController): Promise<ProoferUI> {
    const ui = new ProoferUI();
    await ui.initialize(canvasContainer, controller);
    return ui;
  }

  private constructor() {
    // Private constructor
  }

  /**
   * Initialize engine, resources, geometry, and material
   */
  private async initialize(canvasContainer: HTMLElement, controller: ProoferController): Promise<void> {
    this.canvasContainer = canvasContainer;
    this.prooferController = controller;

    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'proofer-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.canvasContainer.appendChild(canvas);

    // Initialize EngineController
    this.engineController = new EngineController('#proofer-canvas');

    // Initialize ResourceManager
    await ResourceManager.init();

    // Start with black placeholder masks (no effect)
    // Parser masks will override these when payload is loaded
    // DO NOT load demo masks - parser is the source of truth
    const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0), THREE.NoColorSpace);
    blackMask.generateMipmaps = false;
    blackMask.minFilter = THREE.LinearFilter;
    blackMask.magFilter = THREE.LinearFilter;

    // Start with white texture (will be updated by EngineBridge from state)
    const artworkTexture = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(1.0, 1.0, 1.0));

    // Get initial state
    const state = this.prooferController.getState();

    // Create card geometry
    this.cardGeometry = new CardGeometry({
      width: state.width,
      height: state.height,
      thickness: state.thickness,
      cornerRadius: state.cornerRadius
    });

    // Create material with black placeholder masks (will be replaced by parser masks)
    // Parser masks are the source of truth - never use demo/preset masks
    this.material = MaterialPipeline.createCardMaterial({
      frontArtwork: artworkTexture,
      backArtwork: artworkTexture, // Will be updated by EngineBridge based on state
      foilMask: blackMask,
      uvMask: blackMask,
      embossMask: blackMask,
      dieCutMask: blackMask
    });

    // Create mesh and add to scene
    this.cardMesh = new THREE.Mesh(this.cardGeometry.geometry, this.material);
    
    // DEBUG: Verify geometry has faceType attribute
    const faceTypeAttr = this.cardGeometry.geometry.getAttribute('faceType');
    if (faceTypeAttr) {
      const faceTypeArray = faceTypeAttr.array as Float32Array;
      const uniqueValues = new Set(Array.from(faceTypeArray));
      console.log('[ProoferUI] Geometry faceType attribute:', {
        count: faceTypeAttr.count,
        uniqueValues: Array.from(uniqueValues),
        sampleValues: Array.from(faceTypeArray.slice(0, 10))
      });
    } else {
      console.error('[ProoferUI] WARNING: Geometry missing faceType attribute!');
    }
    
    this.engineController.add(this.cardMesh);

    // Start render loop
    this.engineController.start();

    // Initialize engine bridge (connects state to material)
    this.engineBridge = new EngineBridge(this.prooferController, this.material, this.cardGeometry);

    // Register material for lighting updates
    this.engineController.registerMaterialForLighting(this.material);

    // Listen to state changes for geometry updates
    this.prooferController.addListener((state) => {
      this.updateGeometry(state);
    });

    // Watch for container size changes (when panels are resized)
    this.setupResizeObserver();

    console.log('[Proofer] Viewport initialized');
  }

  /**
   * Setup ResizeObserver to watch canvas container size changes
   * This ensures the renderer updates when panels are resized
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce resize to avoid excessive calls
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        if (this.engineController) {
          this.engineController.resize();
        }
      }, 100);
    });

    this.resizeObserver.observe(this.canvasContainer);
  }

  private resizeTimeout: NodeJS.Timeout | null = null;

  /**
   * Update geometry from state
   */
  private updateGeometry(state: any): void {
    this.cardGeometry.updateDimensions(
      state.width,
      state.height,
      state.thickness,
      state.cornerRadius
    );
    this.cardMesh.geometry = this.cardGeometry.geometry;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    if (this.engineController) {
      this.engineController.dispose();
    }
    if (this.cardGeometry) {
      this.cardGeometry.dispose();
    }
  }
}
