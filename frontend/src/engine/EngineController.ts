import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { LightingController, type LightingPreset } from './LightingController.js';

/**
 * Engine Controller
 * Core rendering system - decoupled from business logic
 * Manages renderer, scene, camera, lighting, and render loop
 */
export class EngineController {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls | null = null;
  private canvas: HTMLCanvasElement;
  private animationId: number | null = null;
  private isInitialized: boolean = false;

  // Lighting Controller - manages lighting presets
  private lightingController: LightingController | null = null;
  
  // Materials that need lighting updates (registered by TestHarness)
  private materialsToUpdate: Set<THREE.ShaderMaterial> = new Set();

  // Resize handler (stored for cleanup)
  private resizeHandler: () => void;

  /**
   * Constructor with canvas selector
   */
  constructor(canvasSelector: string) {
    // Find canvas element
    const canvasElement = document.querySelector(canvasSelector) as HTMLCanvasElement;
    if (!canvasElement) {
      throw new Error(`Canvas element not found: ${canvasSelector}`);
    }
    this.canvas = canvasElement;

    // Create renderer with proper settings
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    // Configure renderer
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 150);
    this.camera.lookAt(0, 0, 0);

    // Set up resize handler
    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);

    // Set initial size
    this.handleResize();

    // Set up OrbitControls (dev only)
    this.setupControls();

    // Set up lighting controller (manages lighting presets)
    this.lightingController = new LightingController(this.scene);

    // Initialize resource manager and load HDRI environment (async, non-blocking)
    this.initializeResources();

    this.isInitialized = true;
  }

  /**
   * Initialize resources asynchronously (non-blocking)
   */
  private async initializeResources(): Promise<void> {
    await ResourceManager.init();
    await this.loadHDRI();
  }

  /**
   * Set up OrbitControls (dev only)
   */
  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 500;
    this.controls.target.set(0, 0, 0);
  }

  /**
   * Set lighting preset
   * Only adjusts light intensities - colors, positions, and HDR remain unchanged
   * 
   * @param presetName - Name of the preset to apply
   */
  setLightingPreset(presetName: LightingPreset): void {
    if (this.lightingController) {
      this.lightingController.setLightingPreset(presetName);
    }
  }

  /**
   * Get current lighting preset
   */
  getLightingPreset(): LightingPreset | null {
    return this.lightingController?.getCurrentPreset() || null;
  }

  /**
   * Get lighting controller (for advanced use)
   */
  getLightingController(): LightingController | null {
    return this.lightingController;
  }

  /**
   * Load HDRI environment via ResourceManager
   */
  private async loadHDRI(): Promise<void> {
    try {
      const hdrTexture = await ResourceManager.loadHDR('/hdr/environment.hdr');
      this.scene.environment = hdrTexture;
      this.scene.background = hdrTexture;
    } catch (error) {
      // Fallback to solid color background if HDR not found
      console.warn('HDR environment not found, using default background');
      this.scene.background = new THREE.Color(0x1a1a1a);
    }
  }

  /**
   * Add object to scene
   */
  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  /**
   * Register a material to receive lighting updates each frame
   */
  registerMaterialForLighting(material: THREE.ShaderMaterial): void {
    this.materialsToUpdate.add(material);
  }

  /**
   * Unregister a material from lighting updates
   */
  unregisterMaterialForLighting(material: THREE.ShaderMaterial): void {
    this.materialsToUpdate.delete(material);
  }

  /**
   * Start the render loop
   */
  start(): void {
    if (this.animationId !== null) {
      return; // Already running
    }

    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.update();
    };

    animate();
  }

  /**
   * Stop the render loop
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Update (called each frame)
   */
  private update(): void {
    if (!this.isInitialized) {
      return;
    }

    // Update controls
    if (this.controls) {
      this.controls.update();
    }

    // Update lighting uniforms for registered materials
    if (this.materialsToUpdate && this.materialsToUpdate.size > 0) {
      const lightingInfo = this.getLightingInfo();
      this.materialsToUpdate.forEach(material => {
        if (material.uniforms.uLightDirection) {
          material.uniforms.uLightDirection.value.copy(lightingInfo.direction);
        }
        if (material.uniforms.uLightColor) {
          material.uniforms.uLightColor.value.copy(lightingInfo.color);
        }
        if (material.uniforms.uAmbientColor) {
          material.uniforms.uAmbientColor.value.copy(lightingInfo.ambient);
        }
        if (material.uniforms.uCameraPosition) {
          material.uniforms.uCameraPosition.value.copy(lightingInfo.cameraPosition);
        }
      });
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get lighting information for shader materials
   * Returns the primary directional light (key light) information
   */
  getLightingInfo(): {
    direction: THREE.Vector3;
    color: THREE.Color;
    ambient: THREE.Color;
    cameraPosition: THREE.Vector3;
  } {
    // Get key light direction (normalized world direction)
    let lightDirection = new THREE.Vector3(0, 0, 1);
    let lightColor = new THREE.Color(1, 1, 1);
    
    const keyLight = this.lightingController?.getKeyLight();
    if (keyLight) {
      // For DirectionalLight, the direction is from the light's position toward the origin
      // Get world position of the light
      const worldPos = new THREE.Vector3();
      keyLight.getWorldPosition(worldPos);
      
      // Calculate direction from light position to origin (where the card is)
      // DirectionalLight illuminates objects as if light rays are parallel
      // So we normalize the vector from origin to light position
      lightDirection = worldPos.normalize();
      
      // Get light color and intensity
      lightColor = keyLight.color.clone().multiplyScalar(keyLight.intensity);
    }

    // Get ambient light color
    let ambientColor = new THREE.Color(0.25, 0.25, 0.25);
    const ambientLight = this.lightingController?.getAmbientLight();
    if (ambientLight) {
      ambientColor = ambientLight.color.clone().multiplyScalar(ambientLight.intensity);
    }

    // Get camera position in world space
    const cameraPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPosition);

    return {
      direction: lightDirection,
      color: lightColor,
      ambient: ambientColor,
      cameraPosition: cameraPosition
    };
  }

  /**
   * Public resize method (can be called externally, e.g., for fullscreen)
   */
  resize(): void {
    this.handleResize();
  }

  /**
   * Handle window resize
   */
  private handleResize(): void {
    if (!this.canvas) {
      return;
    }

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    // Update camera aspect ratio
    this.camera.aspect = width / height || 1;
    this.camera.updateProjectionMatrix();

    // Update renderer size
    this.renderer.setSize(width, height, false);
  }

  /**
   * Get the Three.js scene (for advanced use cases)
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the Three.js camera (for advanced use cases)
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get the Three.js renderer (for advanced use cases)
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }


  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();

    // Remove controls
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    // Dispose lighting controller
    if (this.lightingController) {
      this.lightingController.dispose();
      this.lightingController = null;
    }

    // Dispose resource manager
    ResourceManager.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Remove event listeners
    window.removeEventListener('resize', this.resizeHandler);
  }
}
