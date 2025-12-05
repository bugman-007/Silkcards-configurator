import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';

/**
 * Resource Manager
 * Centralized GPU asset loading
 * All methods are static for global access
 */
export class ResourceManager {
  private static hdrLoader: RGBELoader | null = null;
  private static textureLoader: TextureLoader | null = null;
  private static loadedTextures: Map<string, THREE.Texture> = new Map();
  private static isInitialized: boolean = false;

  /**
   * Initialize the resource manager
   * Must be called before loading any assets
   */
  static async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize loaders
    this.hdrLoader = new RGBELoader();
    this.textureLoader = new TextureLoader();

    this.isInitialized = true;
  }

  /**
   * Load HDR environment map using RGBELoader
   * Returns Promise<THREE.Texture>
   */
  static async loadHDR(path: string): Promise<THREE.Texture> {
    if (!this.isInitialized) {
      await this.init();
    }

    if (!this.hdrLoader) {
      throw new Error('ResourceManager not initialized');
    }

    return new Promise((resolve, reject) => {
      this.hdrLoader!.load(
        path,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error('Failed to load HDR:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load texture using TextureLoader
   * Returns Promise<THREE.Texture>
   */
  static async loadTexture(path: string): Promise<THREE.Texture> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Check cache
    if (this.loadedTextures.has(path)) {
      return this.loadedTextures.get(path)!;
    }

    if (!this.textureLoader) {
      throw new Error('ResourceManager not initialized');
    }

    return new Promise((resolve, reject) => {
      this.textureLoader!.load(
        path,
        (texture) => {
          texture.flipY = false; // For masks and artwork
          texture.colorSpace = THREE.SRGBColorSpace;
          this.loadedTextures.set(path, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`Failed to load texture ${path}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load mask texture using TextureLoader
   * Returns Promise<THREE.Texture>
   */
  static async loadMask(path: string): Promise<THREE.Texture> {
    return this.loadTexture(path);
  }

  /**
   * Create a placeholder texture (for testing when files don't exist)
   */
  static createPlaceholderTexture(
    width: number = 512,
    height: number = 512,
    color: THREE.Color = new THREE.Color(0.5, 0.5, 0.5)
  ): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Dispose of all resources and free GPU memory
   */
  static dispose(): void {
    // Dispose all textures
    for (const texture of this.loadedTextures.values()) {
      texture.dispose();
    }
    this.loadedTextures.clear();

    // Reset loaders
    this.hdrLoader = null;
    this.textureLoader = null;
    this.isInitialized = false;
  }
}
