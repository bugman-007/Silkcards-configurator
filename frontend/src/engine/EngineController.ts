import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ResourceManager } from '../resources/ResourceManager.js';

/**
 * Engine Controller
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  }

  /**
   * Initialize the engine
   */
  async init(hdrTexture?: THREE.DataTexture): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Configure renderer
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false; // No shadows in Phase 1

    // Set up scene environment
    if (hdrTexture) {
      this.scene.environment = hdrTexture;
      this.scene.background = hdrTexture;
    } else {
      // Fallback background
      this.scene.background = new THREE.Color(0x1a1a1a);
    }

    // Set up lighting
    this.setupLighting();

    // Set up camera
    this.camera.position.set(0, 0, 150);
    this.camera.lookAt(0, 0, 0);

    // Set up controls (dev mode)
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 500;
    this.controls.target.set(0, 0, 0);

    // Handle resize
    window.addEventListener('resize', () => this.resize());

    this.isInitialized = true;
  }

  /**
   * Set up lighting (key light + rim light + ambient)
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
   * Update HDR environment
   */
  updateEnvironment(hdrTexture: THREE.DataTexture): void {
    this.scene.environment = hdrTexture;
    this.scene.background = hdrTexture;
  }

  /**
   * Get the Three.js scene
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the Three.js camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get the Three.js renderer
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Start the render loop
   */
  start(): void {
    if (this.animationId !== null) {
      return;
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
  update(): void {
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
   * Handle window resize
   */
  resize(): void {
    if (!this.isInitialized) {
      return;
    }

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();

    if (this.controls) {
      this.controls.dispose();
    }

    // Remove lights
    if (this.keyLight) {
      this.scene.remove(this.keyLight);
      this.keyLight.dispose();
    }
    if (this.rimLight) {
      this.scene.remove(this.rimLight);
      this.rimLight.dispose();
    }
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }

    // Dispose renderer
    this.renderer.dispose();

    // Remove event listeners
    window.removeEventListener('resize', () => this.resize());
  }
}

