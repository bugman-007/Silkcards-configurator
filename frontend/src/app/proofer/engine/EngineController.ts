import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { LightingController } from './LightingController.js';

/**
 * Engine Controller - Proofer
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
  
  // Materials that need lighting updates
  private materialsToUpdate: Set<THREE.ShaderMaterial> = new Set();

  // Resize handler
  private resizeHandler: () => void;

  /**
   * Constructor with canvas selector
   */
  constructor(canvasSelector: string) {
    const canvasElement = document.querySelector(canvasSelector) as HTMLCanvasElement;
    if (!canvasElement) {
      throw new Error(`Canvas element not found: ${canvasSelector}`);
    }
    this.canvas = canvasElement;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Proofer tends to look too dark with custom ShaderMaterial + ACES.
    // Slight bump is safe; you can later expose this as a UI slider.
    this.renderer.toneMappingExposure = 1.25;

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
    this.handleResize();

    // Set up OrbitControls
    this.setupControls();

    // Set up lighting controller
    this.lightingController = new LightingController(this.scene);

    // Initialize resources
    this.initializeResources();

    this.isInitialized = true;
  }

  /**
   * Initialize resources asynchronously
   */
  private async initializeResources(): Promise<void> {
    await ResourceManager.init();
    await this.loadHDRI();
  }

  /**
   * Set up OrbitControls
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
   * Get lighting controller
   */
  getLightingController(): LightingController | null {
    return this.lightingController;
  }

  /**
   * Load HDRI environment
   */
  private async loadHDRI(): Promise<void> {
    try {
      const hdrTexture = await ResourceManager.loadHDR('/hdr/environment.hdr');
    this.scene.environment = hdrTexture;
    this.scene.background = hdrTexture;
    } catch (error) {
      console.error('Failed to load HDR environment:', error);
    }
  }

  /**
   * Add object to scene
   */
  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  /**
   * Register a material to receive lighting updates
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
  private update(): void {
    if (!this.isInitialized) {
      return;
    }

    // Update controls
    if (this.controls) {
      this.controls.update();
    }

    // Update lighting uniforms for ALL shader materials in the scene
    const lightingInfo = this.getLightingInfo();

    const applyLighting = (mat: any) => {
      if (!mat || !mat.uniforms) return;

      // Only touch our proofer shader materials
      if (mat.uniforms.uLightDirection) mat.uniforms.uLightDirection.value.copy(lightingInfo.direction);
      if (mat.uniforms.uLightColor) mat.uniforms.uLightColor.value.copy(lightingInfo.color);
      if (mat.uniforms.uAmbientColor) mat.uniforms.uAmbientColor.value.copy(lightingInfo.ambient);
      if (mat.uniforms.uCameraPosition) mat.uniforms.uCameraPosition.value.copy(lightingInfo.cameraPosition);
    };

    this.scene.traverse((obj: THREE.Object3D) => {
      const anyObj: any = obj as any;
      const m = anyObj.material;
      if (!m) return;

      if (Array.isArray(m)) {
        for (const mm of m) applyLighting(mm);
      } else {
        applyLighting(m);
      }
    });

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get lighting information for shader materials
   */
  getLightingInfo(): {
    direction: THREE.Vector3;
    color: THREE.Color;
    ambient: THREE.Color;
    cameraPosition: THREE.Vector3;
  } {
    let lightDirection = new THREE.Vector3(0, 0, 1);
    let lightColor = new THREE.Color(1, 1, 1);
    
    const keyLight = this.lightingController?.getKeyLight();
    if (keyLight) {
      const lightPos = new THREE.Vector3();
      const targetPos = new THREE.Vector3();

      keyLight.getWorldPosition(lightPos);
      keyLight.target.getWorldPosition(targetPos);

      // Direction the light is pointing (from light -> target)
      lightDirection = targetPos.sub(lightPos).normalize();

      // Color already multiplied by intensity
      lightColor = keyLight.color.clone().multiplyScalar(keyLight.intensity);
    }

    let ambientColor = new THREE.Color(0.25, 0.25, 0.25);
    const ambientLight = this.lightingController?.getAmbientLight();
    if (ambientLight) {
      ambientColor = ambientLight.color.clone().multiplyScalar(ambientLight.intensity);
    }

    return {
      direction: lightDirection,
      color: lightColor,
      ambient: ambientColor,
      cameraPosition: this.camera.position.clone()
    };
  }

  /**
   * Public resize method
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

    this.camera.aspect = width / height || 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
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
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();

    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    if (this.lightingController) {
      this.lightingController.dispose();
      this.lightingController = null;
    }

    ResourceManager.dispose();
    this.renderer.dispose();
    window.removeEventListener('resize', this.resizeHandler);
  }
}

