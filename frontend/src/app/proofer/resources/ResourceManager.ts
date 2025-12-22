import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';
import { rewriteAssetUrl } from '../utils/urlRewriter.js';

/**
 * Resource Manager - Proofer
 * Centralized GPU asset loading for proofer
 */
export class ResourceManager {
  private static hdrLoader: RGBELoader | null = null;
  private static textureLoader: TextureLoader | null = null;
  private static loadedTextures: Map<string, THREE.Texture> = new Map();
  private static maskTextures: Map<string, THREE.Texture> = new Map();
  private static isInitialized: boolean = false;

  /**
   * Initialize the resource manager
   */
  static async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.hdrLoader = new RGBELoader();
    this.textureLoader = new TextureLoader();
    this.isInitialized = true;
  }

  /**
   * Load HDR environment map
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
   * Load texture
   */
  static async loadTexture(path: string): Promise<THREE.Texture> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Rewrite HTTP asset URLs to use proxy in production (avoid mixed content)
    const rewrittenPath = rewriteAssetUrl(path);
    
    // Use rewritten path for caching
    if (this.loadedTextures.has(rewrittenPath)) {
      return this.loadedTextures.get(rewrittenPath)!;
    }

    if (!this.textureLoader) {
      throw new Error('ResourceManager not initialized');
    }

    return new Promise((resolve, reject) => {
      this.textureLoader!.load(
        rewrittenPath,
        (texture) => {
          texture.flipY = false;
          texture.colorSpace = THREE.SRGBColorSpace;
          // Cache by rewritten path
          this.loadedTextures.set(rewrittenPath, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`Failed to load texture ${rewrittenPath} (original: ${path}):`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load mask texture
   */
  static async loadMask(path: string): Promise<THREE.Texture> {
    return this.loadTexture(path);
  }

  /**
   * Load finish mask textures (foil, uv, emboss)
   * Must be called before material initialization
   */
  static async loadFinishMasks(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    const maskPaths = {
      foil: '/masks/foil.png',
      uv: '/masks/uv.png',
      emboss: '/masks/emboss.png',
      diecut: '/masks/die.png'
    };

    // Load all masks in parallel
    const loadPromises = Object.entries(maskPaths).map(async ([key, path]) => {
      try {
        const texture = await this.loadMask(path);
        // UV and emboss masks need to be flipped vertically
        if (key === 'uv' || key === 'emboss') {
          texture.flipY = true;
        }
        // Die-cut mask will be flipped horizontally in the shader via UV coordinates
        this.maskTextures.set(key, texture);
        console.log(`Loaded ${key} mask: ${path}`);
      } catch (error) {
        console.warn(`Failed to load ${key} mask, using placeholder:`, error);
        // Create black placeholder (no effect)
        const placeholder = this.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0));
        this.maskTextures.set(key, placeholder);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Get mask texture by name (foil, uv, emboss, diecut)
   */
  static getMaskTexture(name: 'foil' | 'uv' | 'emboss' | 'diecut'): THREE.Texture | null {
    return this.maskTextures.get(name) || null;
  }

  /**
   * Get a cached texture if it exists
   */
  static getCachedTexture(url: string): THREE.Texture | null {
    return this.loadedTextures.get(url) || null;
  }

  /**
   * Remove a texture from cache and dispose it
   */
  static disposeTexture(url: string): void {
    const texture = this.loadedTextures.get(url);
    if (texture) {
      texture.dispose();
      this.loadedTextures.delete(url);
    }
  }

  /**
   * Create a placeholder texture
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
   * Dispose of all resources
   */
  static dispose(): void {
    for (const texture of this.loadedTextures.values()) {
      texture.dispose();
    }
    this.loadedTextures.clear();

    this.hdrLoader = null;
    this.textureLoader = null;
    this.isInitialized = false;
  }
}

