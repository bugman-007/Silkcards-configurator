import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';
import { rewriteAssetUrl } from '../utils/urlRewriter.js';
import { ParserPayload, ParserPlate, PlyStack, Composites, CardPx } from '../state/ProoferState.js';

/**
 * Resource Manager - Proofer
 * Centralized GPU asset loading and CPU compositing for proofer
 */
export class ResourceManager {
  private static hdrLoader: RGBELoader | null = null;
  private static textureLoader: TextureLoader | null = null;
  private static loadedTextures: Map<string, THREE.Texture> = new Map();
  private static loadedImages: Map<string, HTMLImageElement | ImageBitmap> = new Map();
  private static compositeCache: Map<string, THREE.Texture> = new Map();
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
   * Load texture (returns THREE.Texture for GPU)
   */
  static async loadTexture(
    path: string,
    options?: {
      colorSpace?: THREE.ColorSpace;
      flipY?: boolean;
      generateMipmaps?: boolean;
      minFilter?: THREE.MinificationTextureFilter;
      magFilter?: THREE.MagnificationTextureFilter;
    }
  ): Promise<THREE.Texture> {
    if (!this.isInitialized) {
      await this.init();
    }

    const rewrittenPath = rewriteAssetUrl(path);
    const colorSpace = options?.colorSpace ?? THREE.SRGBColorSpace;
    const flipY = options?.flipY ?? false;
    const generateMipmaps = options?.generateMipmaps ?? true;
    const minFilter = options?.minFilter ?? THREE.LinearMipmapLinearFilter;
    const magFilter = options?.magFilter ?? THREE.LinearFilter;
    const cacheKey = `${rewrittenPath}|cs:${colorSpace}|fy:${flipY}|mm:${generateMipmaps}|min:${minFilter}|mag:${magFilter}`;

    if (this.loadedTextures.has(cacheKey)) {
      return this.loadedTextures.get(cacheKey)!;
    }

    if (!this.textureLoader) {
      throw new Error('ResourceManager not initialized');
    }

    return new Promise((resolve, reject) => {
      this.textureLoader!.load(
        rewrittenPath,
        (texture) => {
          texture.flipY = flipY;
          texture.colorSpace = colorSpace;
          texture.generateMipmaps = generateMipmaps;
          texture.minFilter = minFilter;
          texture.magFilter = magFilter;
          this.loadedTextures.set(cacheKey, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`Failed to load texture ${rewrittenPath}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load image as HTMLImageElement/ImageBitmap for CPU compositing
   * Returns decoded image data, not THREE.Texture
   */
  static async loadImage(path: string): Promise<HTMLImageElement | ImageBitmap> {
    const rewrittenPath = rewriteAssetUrl(path);
    
    if (this.loadedImages.has(rewrittenPath)) {
      return this.loadedImages.get(rewrittenPath)!;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.loadedImages.set(rewrittenPath, img);
        resolve(img);
      };
      img.onerror = (error) => {
        console.error(`Failed to load image ${rewrittenPath}:`, error);
        reject(error);
      };
      img.src = rewrittenPath;
    });
  }

  /**
   * Load mask texture
   */
  static async loadMask(path: string): Promise<THREE.Texture> {
    return this.loadTexture(path, {
      colorSpace: THREE.NoColorSpace,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
  }

  /**
   * Extract layer number from plate ID for deterministic sorting
   * e.g., "front_layer_0_print" -> 0, "front_layer_1_print" -> 1
   */
  private static extractLayerNumber(plateId: string): number {
    const match = plateId.match(/_layer_(\d+)_/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Sort plates deterministically: by layer number, then by ID
   */
  private static sortPlates(plates: ParserPlate[]): ParserPlate[] {
    return [...plates].sort((a, b) => {
      const layerA = this.extractLayerNumber(a.id);
      const layerB = this.extractLayerNumber(b.id);
      if (layerA !== layerB) {
        return layerA - layerB;
      }
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Get card size from plates (use cardPx from first plate, or compute from PRINT plates)
   */
  private static getCardSize(plates: ParserPlate[]): CardPx {
    // Try to get cardPx from any plate
    const plateWithCardPx = plates.find(p => p.cardPx);
    if (plateWithCardPx?.cardPx) {
      return plateWithCardPx.cardPx;
    }

    // Fallback: compute from PRINT plates' rectPx
    const printPlates = plates.filter(p => p.type === 'PRINT' && p.rectPx);
    if (printPlates.length > 0) {
      let maxX1 = 0;
      let maxY1 = 0;
      for (const plate of printPlates) {
        if (plate.rectPx) {
          maxX1 = Math.max(maxX1, plate.rectPx.x1);
          maxY1 = Math.max(maxY1, plate.rectPx.y1);
        }
      }
      if (maxX1 > 0 && maxY1 > 0) {
        return { w: maxX1, h: maxY1 };
      }
    }

    // Ultimate fallback
    return { w: 2100, h: 1200 };
  }

  /**
   * Get plate image URL.
   *
   * IMPORTANT:
   * - The parser service serves files under `/assets/<jobId>/out/...` (see silkcards-parser routes).
   * - Most payloads already provide fully-qualified `plate.assets.*` URLs; prefer those.
   * - `plate.file` (when present) is typically just a filename; we must build the `/assets/<jobId>/out/<file>` URL.
   */
  private static getPlateImageUrl(plate: ParserPlate, jobId: string): string | null {
    // 1) Prefer explicit asset URLs from meta.json (already correct and rewritten server-side)
    const assetPreferred =
      plate.type === 'PRINT'
        ? (plate.assets?.png ?? null)
        : (plate.assets?.maskPng ?? plate.assets?.heightPng ?? plate.assets?.png ?? null);

    if (typeof assetPreferred === 'string' && assetPreferred.length > 0) {
      const url = rewriteAssetUrl(assetPreferred);
      console.log(`[ResourceManager] Resolved URL for ${plate.id} (from assets):`, url);
      return url;
    }

    // 2) Fall back to `file` field (filename or URL)
    if (typeof plate.file === 'string' && plate.file.length > 0) {
      // Already a URL or a proxied/relative URL
      if (
        plate.file.startsWith('http://') ||
        plate.file.startsWith('https://') ||
        plate.file.startsWith('/api/parser-proxy') ||
        plate.file.startsWith('/')
      ) {
        const url = rewriteAssetUrl(plate.file);
        console.log(`[ResourceManager] Resolved URL for ${plate.id} (from file - URL):`, url);
        return url;
      }

      // Build URL from filename using parser assets route: /assets/<jobId>/out/<file>
      const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
      const useProxy = isProduction && (!envBaseUrl || envBaseUrl.startsWith('http://'));

      const relativeOutPath = `assets/${jobId}/out/${plate.file}`;
      let url: string;
      if (useProxy) {
        url = `/api/parser-proxy/${relativeOutPath}`;
      } else {
        const baseUrl = envBaseUrl || 'http://localhost:8080';
        url = rewriteAssetUrl(`${baseUrl}/${relativeOutPath}`);
      }
      console.log(`[ResourceManager] Resolved URL for ${plate.id} (from file - filename):`, url);
      return url;
    }

    console.warn(`[ResourceManager] No URL found for plate ${plate.id}:`, { assets: plate.assets, file: plate.file });
    return null;
  }

  /**
   * Composite PRINT plates: alpha blend in order (normal alpha over)
   */
  private static async compositePrints(
    plates: ParserPlate[],
    cardSize: CardPx,
    jobId: string
  ): Promise<THREE.Texture | null> {
    if (plates.length === 0) {
      console.log(`[ResourceManager] No print plates to composite`);
      return null;
    }

    console.log(`[ResourceManager] Compositing ${plates.length} print plates for jobId=${jobId}, cardSize=${cardSize.w}x${cardSize.h}px`);
    const sortedPlates = this.sortPlates(plates);
    const canvas = document.createElement('canvas');
    canvas.width = cardSize.w;
    canvas.height = cardSize.h;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    // Start with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Composite each PRINT plate in order
    for (const plate of sortedPlates) {
      const url = this.getPlateImageUrl(plate, jobId);
      if (!url) continue;

      try {
        const img = await this.loadImage(url);
        const imgW = (img as any).width as number;
        const imgH = (img as any).height as number;
        console.log(`[ResourceManager] Image loaded for ${plate.id}: ${imgW}x${imgH}px`);
        
        // Placement rect in card pixel space (top-left origin)
        const rect =
          plate.rectPx
            ? {
                x0: plate.rectPx.x0,
                y0: plate.rectPx.y0,
                x1: plate.rectPx.x1,
                y1: plate.rectPx.y1,
                w: plate.sizePx?.w ?? (plate.rectPx.x1 - plate.rectPx.x0),
                h: plate.sizePx?.h ?? (plate.rectPx.y1 - plate.rectPx.y0)
              }
            : (plate.startPx && plate.endPx)
              ? {
                  x0: plate.startPx.x,
                  y0: plate.startPx.y,
                  x1: plate.endPx.x,
                  y1: plate.endPx.y,
                  w: plate.sizePx?.w ?? (plate.endPx.x - plate.startPx.x),
                  h: plate.sizePx?.h ?? (plate.endPx.y - plate.startPx.y)
                }
              : null;

        if (rect) {
          // Draw at specific position with size
          const drawW = rect.w || imgW;
          const drawH = rect.h || imgH;
          console.log(`[ResourceManager] Drawing print plate ${plate.id}: imgSize=${imgW}x${imgH}, rect=${rect.x0},${rect.y0} size=${drawW}x${drawH}`);
          ctx.drawImage(img, rect.x0, rect.y0, drawW, drawH);
        } else {
          // Fallback: draw full canvas
          console.log(`[ResourceManager] Drawing print plate ${plate.id}: imgSize=${imgW}x${imgH}, filling full canvas ${canvas.width}x${canvas.height}`);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      } catch (error) {
        console.error(`[ResourceManager] FAILED to load/draw print plate ${plate.id} from URL ${url}:`, error);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    console.log(`[ResourceManager] Composited print texture: ${canvas.width}x${canvas.height}px, uuid=${texture.uuid}`);
    return texture;
  }

  /**
   * Composite mask plates: max(alpha) per channel to avoid holes
   */
  private static async compositeMasks(
    plates: ParserPlate[],
    cardSize: CardPx,
    jobId: string
  ): Promise<THREE.Texture | null> {
    if (plates.length === 0) {
      return null;
    }

    const sortedPlates = this.sortPlates(plates);
    const canvas = document.createElement('canvas');
    canvas.width = cardSize.w;
    canvas.height = cardSize.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true })!;

    // Start with black (no effect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Accumulate max per pixel
    const accum = new Uint8ClampedArray(canvas.width * canvas.height * 4);

    for (const plate of sortedPlates) {
      const url = this.getPlateImageUrl(plate, jobId);
      if (!url) continue;

      try {
        const img = await this.loadImage(url);
        const imgW0 = (img as any).width as number;
        const imgH0 = (img as any).height as number;
        console.log(`[ResourceManager] Image loaded for mask ${plate.id}: ${imgW0}x${imgH0}px`);
        
        // Placement rect in card pixel space (top-left origin)
        const rect =
          plate.rectPx
            ? {
                x0: plate.rectPx.x0,
                y0: plate.rectPx.y0,
                x1: plate.rectPx.x1,
                y1: plate.rectPx.y1,
                w: plate.sizePx?.w ?? (plate.rectPx.x1 - plate.rectPx.x0),
                h: plate.sizePx?.h ?? (plate.rectPx.y1 - plate.rectPx.y0)
              }
            : (plate.startPx && plate.endPx)
              ? {
                  x0: plate.startPx.x,
                  y0: plate.startPx.y,
                  x1: plate.endPx.x,
                  y1: plate.endPx.y,
                  w: plate.sizePx?.w ?? (plate.endPx.x - plate.startPx.x),
                  h: plate.sizePx?.h ?? (plate.endPx.y - plate.startPx.y)
                }
              : null;

        // Draw to temp canvas to get pixel data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rect ? (rect.w || imgW0) : imgW0;
        tempCanvas.height = rect ? (rect.h || imgH0) : imgH0;
        console.log(`[ResourceManager] Compositing mask ${plate.id}: tempCanvas=${tempCanvas.width}x${tempCanvas.height}`);
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;

        // Accumulate max into main canvas
        const startX = rect ? rect.x0 : 0;
        const startY = rect ? rect.y0 : 0;
        const imgW = tempCanvas.width;
        const imgH = tempCanvas.height;

        for (let py = 0; py < imgH; py++) {
          for (let px = 0; px < imgW; px++) {
            const srcIdx = (py * imgW + px) * 4;
            const dstX = startX + px;
            const dstY = startY + py;
            if (dstX >= 0 && dstX < canvas.width && dstY >= 0 && dstY < canvas.height) {
              const dstIdx = (dstY * canvas.width + dstX) * 4;
              for (let c = 0; c < 4; c++) {
                accum[dstIdx + c] = Math.max(accum[dstIdx + c], imgData[srcIdx + c]);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`[ResourceManager] Failed to load mask plate ${plate.id}:`, error);
      }
    }

    // Write accumulated data to canvas
    const out = ctx.createImageData(canvas.width, canvas.height);
    out.data.set(accum);
    ctx.putImageData(out, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Build composites for a single ply/face
   * This is the main CPU compositor entry point
   */
  static async buildComposites(
    plyStack: PlyStack,
    jobId: string
  ): Promise<Map<string, Composites>> {
    console.log(`[ResourceManager] buildComposites: jobId=${jobId}, plyIndex=${plyStack.plyIndex}`);
    const composites = new Map<string, Composites>();

    // Get card size from any plate
    const allPlates = [
      ...plyStack.front.prints,
      ...plyStack.front.foilMasks,
      ...plyStack.front.uvMasks,
      ...plyStack.front.embossMasks,
      ...plyStack.back.prints,
      ...plyStack.back.foilMasks,
      ...plyStack.back.uvMasks,
      ...plyStack.back.embossMasks
    ];
    if (plyStack.front.diecut) allPlates.push(plyStack.front.diecut);
    if (plyStack.back.diecut) allPlates.push(plyStack.back.diecut);

    console.log(`[ResourceManager] Plate counts: front.prints=${plyStack.front.prints.length}, back.prints=${plyStack.back.prints.length}`);
    const cardSize = this.getCardSize(allPlates);
    console.log(`[ResourceManager] Card size: ${cardSize.w}x${cardSize.h}px`);

    // Build cache key
    const plateIds = allPlates.map(p => p.id).sort().join('|');
    const cacheKey = `${jobId}|ply${plyStack.plyIndex}|${plateIds}`;

    // Check cache
    if (this.compositeCache.has(cacheKey)) {
      // Return cached composites (would need to restructure, but for now rebuild)
    }

    // Composite front prints
    const frontPrint = await this.compositePrints(plyStack.front.prints, cardSize, jobId);
    
    // Composite back prints
    const backPrint = await this.compositePrints(plyStack.back.prints, cardSize, jobId);

    // Composite front masks
    const frontFoilMask = await this.compositeMasks(plyStack.front.foilMasks, cardSize, jobId);
    const frontUvMask = await this.compositeMasks(plyStack.front.uvMasks, cardSize, jobId);
    const frontEmbossMask = await this.compositeMasks(plyStack.front.embossMasks, cardSize, jobId);

    // Composite back masks
    const backFoilMask = await this.compositeMasks(plyStack.back.foilMasks, cardSize, jobId);
    const backUvMask = await this.compositeMasks(plyStack.back.uvMasks, cardSize, jobId);
    const backEmbossMask = await this.compositeMasks(plyStack.back.embossMasks, cardSize, jobId);

    // Diecut (single plate, prefer front if both exist)
    let diecutMask: THREE.Texture | null = null;
    if (plyStack.front.diecut) {
      const url = this.getPlateImageUrl(plyStack.front.diecut, jobId);
      if (url) {
        try {
          diecutMask = await this.loadMask(url);
        } catch (error) {
          console.warn(`[ResourceManager] Failed to load diecut:`, error);
        }
      }
    } else if (plyStack.back.diecut) {
      const url = this.getPlateImageUrl(plyStack.back.diecut, jobId);
      if (url) {
        try {
          diecutMask = await this.loadMask(url);
        } catch (error) {
          console.warn(`[ResourceManager] Failed to load diecut:`, error);
        }
      }
    }

    const result: Composites = {
      frontPrint,
      backPrint,
      frontFoilMask,
      backFoilMask,
      frontUvMask,
      backUvMask,
      frontEmbossMask,
      backEmbossMask,
      diecutMask
    };

    console.log(`[ResourceManager] Composites built for ply${plyStack.plyIndex}:`, {
      frontPrint: frontPrint ? `${frontPrint.image.width}x${frontPrint.image.height}` : 'null',
      backPrint: backPrint ? `${backPrint.image.width}x${backPrint.image.height}` : 'null',
      frontFoilMask: !!frontFoilMask,
      backFoilMask: !!backFoilMask,
      frontUvMask: !!frontUvMask,
      backUvMask: !!backUvMask,
      frontEmbossMask: !!frontEmbossMask,
      backEmbossMask: !!backEmbossMask,
      diecutMask: !!diecutMask
    });

    composites.set(`ply${plyStack.plyIndex}`, result);
    return composites;
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
    color: THREE.Color = new THREE.Color(0.5, 0.5, 0.5),
    colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
  ): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = colorSpace;
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

    for (const texture of this.compositeCache.values()) {
      texture.dispose();
    }
    this.compositeCache.clear();

    this.loadedImages.clear();

    this.hdrLoader = null;
    this.textureLoader = null;
    this.isInitialized = false;
  }
}
