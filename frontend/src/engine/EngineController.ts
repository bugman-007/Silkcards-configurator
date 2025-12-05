import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ResourceManager } from '../resources/ResourceManager.js';

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

  // Lighting
  private keyLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

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

    // Set up lighting
    this.setupLighting();

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
   * Set up lighting (key light + rim light)
   */
  private setupLighting(): void {
    // Ambient light for base illumination
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambientLight);

    // Key light (main directional light)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.keyLight.position.set(50, 50, 50);
    this.scene.add(this.keyLight);

    // Rim light (back light for edge definition)
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.rimLight.position.set(-50, 30, -50);
    this.scene.add(this.rimLight);
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

    // Render
    this.renderer.render(this.scene, this.camera);
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

    // Remove lights
    if (this.keyLight) {
      this.scene.remove(this.keyLight);
      this.keyLight.dispose();
      this.keyLight = null;
    }
    if (this.rimLight) {
      this.scene.remove(this.rimLight);
      this.rimLight.dispose();
      this.rimLight = null;
    }
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }

    // Dispose resource manager
    ResourceManager.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Remove event listeners
    window.removeEventListener('resize', this.resizeHandler);
  }
}
