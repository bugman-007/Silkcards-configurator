import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';

/**
 * Resource Manager
 * Handles loading of HDR environments, textures, and masks
 * Manages GPU memory and cleanup
 */
export class ResourceManager {
  private hdrLoader: RGBELoader;
  private textureLoader: TextureLoader;
  private loadedTextures: Map<string, THREE.Texture> = new Map();
  private loadedHDR: THREE.DataTexture | null = null;

  constructor() {
    this.hdrLoader = new RGBELoader();
    this.textureLoader = new TextureLoader();
  }

  /**
   * Load HDR environment map
   */
  async loadHDR(path: string): Promise<THREE.DataTexture> {
    return new Promise((resolve, reject) => {
      this.hdrLoader.load(
        path,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.loadedHDR = texture;
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
   * Load a texture (artwork, mask, etc.)
   */
  async loadTexture(path: string, name: string): Promise<THREE.Texture> {
    if (this.loadedTextures.has(name)) {
      return this.loadedTextures.get(name)!;
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          texture.flipY = false; // For masks and artwork
          texture.colorSpace = THREE.SRGBColorSpace;
          this.loadedTextures.set(name, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`Failed to load texture ${name}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load a mask texture (foil, UV, emboss)
   */
  async loadMask(path: string, name: string): Promise<THREE.Texture> {
    return this.loadTexture(path, name);
  }

  /**
   * Create a placeholder texture (for testing when files don't exist)
   */
  createPlaceholderTexture(width: number = 512, height: number = 512, color: THREE.Color = new THREE.Color(0.5, 0.5, 0.5)): THREE.Texture {
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
   * Get loaded HDR texture
   */
  getHDR(): THREE.DataTexture | null {
    return this.loadedHDR;
  }

  /**
   * Get loaded texture by name
   */
  getTexture(name: string): THREE.Texture | undefined {
    return this.loadedTextures.get(name);
  }

  /**
   * Dispose of all resources and free GPU memory
   */
  dispose(): void {
    // Dispose HDR
    if (this.loadedHDR) {
      this.loadedHDR.dispose();
      this.loadedHDR = null;
    }

    // Dispose all textures
    for (const texture of this.loadedTextures.values()) {
      texture.dispose();
    }
    this.loadedTextures.clear();
  }
}

