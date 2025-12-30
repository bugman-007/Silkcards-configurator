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
  // SVG text + parsed outlines cache (die-cut)
  private static loadedSvgText: Map<string, string> = new Map();
  // key: svgUrl|cardW|cardH|sampleStep
  private static diecutOutlineCache: Map<string, Array<Array<THREE.Vector2>>> = new Map();
  // key: svgUrl|pxW|pxH (rasterized mask)
  private static diecutMaskCache: Map<string, THREE.Texture> = new Map();
  private static diecutSvgMaskCache: Map<string, THREE.Texture> = new Map();
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
      flipY: true, // IMPORTANT: match print orientation (prints use flipY=true)
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
   * Get plate SVG URL (used for DIECUT outline geometry)
   */
  private static getPlateSvgUrl(plate: ParserPlate, jobId: string): string | null {
    const candidates: string[] = [];
  
    const pushCandidate = (v: any) => {
      if (typeof v !== 'string' || v.length === 0) return;
      const s = v.toLowerCase();
      if (s.startsWith('data:image/svg+xml') || s.includes('.svg')) candidates.push(v);
    };
  
    const assets: any = (plate as any).assets;
    if (assets && typeof assets === 'object') {
      // Prefer common keys first
      const preferredKeys = [
        'svg',
        'maskSvg',
        'diecutSvg',
        'dieCutSvg',
        'outlineSvg',
        'vectorSvg',
        'cutSvg',
        'mask_svg',
        'diecut_svg',
        'outline_svg',
      ];
      for (const k of preferredKeys) pushCandidate(assets[k]);
  
      // Then scan 1-level deep (covers most payload variants)
      for (const [, v] of Object.entries(assets)) {
        pushCandidate(v);
        if (v && typeof v === 'object') {
          for (const [, vv] of Object.entries(v as any)) pushCandidate(vv);
        }
      }
    }
  
    if (candidates.length > 0) {
      const url = rewriteAssetUrl(candidates[0]);
      console.log(`[ResourceManager] Resolved SVG URL for ${plate.id} (scan):`, url);
      return url;
    }
  
    // Fallback: `file` may be a filename or URL
    if (typeof plate.file === 'string' && plate.file.length > 0 && plate.file.toLowerCase().endsWith('.svg')) {
      if (
        plate.file.startsWith('http://') ||
        plate.file.startsWith('https://') ||
        plate.file.startsWith('/api/parser-proxy') ||
        plate.file.startsWith('/')
      ) {
        const url = rewriteAssetUrl(plate.file);
        console.log(`[ResourceManager] Resolved SVG URL for ${plate.id} (from file - URL):`, url);
        return url;
      }
  
      const url = rewriteAssetUrl(`/assets/${jobId}/out/${plate.file}`);
      console.log(`[ResourceManager] Resolved SVG URL for ${plate.id} (from file - filename):`, url);
      return url;
    }
  
    return null;
  }
  

  /**
   * Load die-cut SVG outline(s) as polylines in CARD-LOCAL coordinates.
   * Returned points are in the same coordinate space as CardGeometry (centered at 0,0).
   */
  static async loadDiecutOutlinesForPlate(
    plate: ParserPlate,
    jobId: string,
    cardWidth: number,
    cardHeight: number,
    sampleStep: number = 4
  ): Promise<Array<Array<THREE.Vector2>>> {
    const url = this.getPlateSvgUrl(plate, jobId);
    if (!url) return [];

    const cacheKey = `${url}|${cardWidth}|${cardHeight}|${sampleStep}`;
    const cached = this.diecutOutlineCache.get(cacheKey);
    if (cached) return cached;

    let svgText = this.loadedSvgText.get(url) || null;
    if (!svgText) {
      console.log(`[ResourceManager] Fetching die-cut SVG:`, url);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[ResourceManager] Failed to fetch SVG ${url}:`, res.status, res.statusText);
        return [];
      }
      svgText = await res.text();
      this.loadedSvgText.set(url, svgText);
    }

    const outlines = this.parseSvgToOutlines(svgText, cardWidth, cardHeight, sampleStep);
    this.diecutOutlineCache.set(cacheKey, outlines);
    return outlines;
  }

  /**
   * Parse SVG text into polylines (Vector2[][]) in CARD-LOCAL coordinates.
   * Notes:
   * - SVG is typically Y-down; we flip Y into Y-up for 3D.
   * - Uses browser-native path sampling (getTotalLength / getPointAtLength).
   */
  private static parseSvgToOutlines(
    svgText: string,
    cardWidth: number,
    cardHeight: number,
    sampleStep: number
  ): Array<Array<THREE.Vector2>> {
    if (typeof document === 'undefined') return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');

    // Import into the real document so SVGGeometry APIs work reliably
    const svgImported = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;

    const holder = document.createElement('div');
    holder.style.position = 'absolute';
    holder.style.left = '-10000px';
    holder.style.top = '-10000px';
    holder.style.width = '0';
    holder.style.height = '0';
    holder.style.overflow = 'hidden';
    holder.appendChild(svgImported);
    document.body.appendChild(holder);

    // ViewBox
    const vbAttr = svgImported.getAttribute('viewBox');
    let vb = { x: 0, y: 0, w: 1, h: 1 };

    if (vbAttr) {
      const parts = vbAttr.split(/[\s,]+/).map(v => parseFloat(v)).filter(v => Number.isFinite(v));
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      }
    } else {
      const w = parseFloat(svgImported.getAttribute('width') || '1');
      const h = parseFloat(svgImported.getAttribute('height') || '1');
      vb = { x: 0, y: 0, w: Number.isFinite(w) && w > 0 ? w : 1, h: Number.isFinite(h) && h > 0 ? h : 1 };
    }

    const toLocal = (p: { x: number; y: number }): THREE.Vector2 => {
      const u = (p.x - vb.x) / vb.w;
      const v = (p.y - vb.y) / vb.h;
      // x: [-w/2..+w/2], y: [+h/2..-h/2] (flip)
      return new THREE.Vector2((u - 0.5) * cardWidth, (0.5 - v) * cardHeight);
    };

    const outlines: Array<Array<THREE.Vector2>> = [];

    // PATHs
    const paths = Array.from(svgImported.querySelectorAll('path')) as SVGPathElement[];
    for (const path of paths) {
      const d = path.getAttribute('d') || '';
      if (!d.trim()) continue;

      const len = path.getTotalLength();
      if (!Number.isFinite(len) || len <= 0) continue;

      const pts: THREE.Vector2[] = [];
      const step = Math.max(1, sampleStep);

      for (let t = 0; t <= len; t += step) {
        const p = path.getPointAtLength(t);
        pts.push(toLocal(p));
      }

      // Ensure last sample at end
      const pend = path.getPointAtLength(len);
      pts.push(toLocal(pend));

      // De-dup consecutive points
      const dedup: THREE.Vector2[] = [];
      for (const p of pts) {
        if (dedup.length === 0 || dedup[dedup.length - 1].distanceToSquared(p) > 1e-8) {
          dedup.push(p);
        }
      }

      // Close if it's a closed path or if endpoints are near
      const isClosedCmd = /[zZ]\s*$/.test(d.trim());
      if (dedup.length >= 3) {
        const d0 = dedup[0];
        const dN = dedup[dedup.length - 1];
        const close = isClosedCmd || d0.distanceToSquared(dN) < 1e-6;
        if (close && d0.distanceToSquared(dN) > 1e-6) {
          dedup.push(d0.clone());
        }
        outlines.push(dedup);
      }
    }

    // POLYGON / POLYLINE (fallback)
    const polys = Array.from(svgImported.querySelectorAll('polygon, polyline')) as (SVGPolygonElement | SVGPolylineElement)[];
    for (const poly of polys) {
      const raw = (poly.getAttribute('points') || '').trim();
      if (!raw) continue;
      const nums = raw.split(/[\s,]+/).map(v => parseFloat(v)).filter(v => Number.isFinite(v));
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push(toLocal({ x: nums[i], y: nums[i + 1] }));
      }
      if (pts.length >= 3) {
        if (pts[0].distanceToSquared(pts[pts.length - 1]) > 1e-6) pts.push(pts[0].clone());
        outlines.push(pts);
      }
    }

    document.body.removeChild(holder);

    // Final sanity: drop tiny outlines
    return outlines.filter(o => o.length >= 4);
  }

  /**
   * Rasterize a DIECUT SVG into an ALPHA mask texture for fragment discard.
   * Output convention (matches fragment.glsl + maskSample):
   *   - alpha 1.0 (white/opaque) => HOLE => discard fragment
   *   - alpha 0.0 (black/transparent) => KEEP => render fragment
   */
  private static async rasterizeDiecutSvgMask(
    svgText: string,
    targetW: number,
    targetH: number
  ): Promise<THREE.Texture | null> {
    if (typeof document === 'undefined') return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgImported = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;

    // Attach so getBBox works reliably
    const holder = document.createElement('div');
    holder.style.position = 'absolute';
    holder.style.left = '-10000px';
    holder.style.top = '-10000px';
    holder.style.width = '0';
    holder.style.height = '0';
    holder.style.overflow = 'hidden';
    holder.appendChild(svgImported);
    document.body.appendChild(holder);

    // viewBox
    const vbAttr = svgImported.getAttribute('viewBox');
    let vb = { x: 0, y: 0, w: 1, h: 1 };
    if (vbAttr) {
      const parts = vbAttr.split(/[\s,]+/).map((v) => parseFloat(v)).filter(Number.isFinite);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    } else {
      const w = parseFloat(svgImported.getAttribute('width') || '1');
      const h = parseFloat(svgImported.getAttribute('height') || '1');
      vb = { x: 0, y: 0, w: Number.isFinite(w) && w > 0 ? w : 1, h: Number.isFinite(h) && h > 0 ? h : 1 };
      svgImported.setAttribute('viewBox', `0 0 ${vb.w} ${vb.h}`);
    }

    const drawable = Array.from(
      svgImported.querySelectorAll('path, polygon, polyline, rect, circle, ellipse')
    ) as SVGGraphicsElement[];

    if (drawable.length === 0) {
      document.body.removeChild(holder);
      return null;
    }

    // Pick largest by bbox area (candidate "outer silhouette")
    const vbArea = Math.max(1e-6, vb.w * vb.h);
    let outerIndex = 0;
    let outerArea = 0;

    for (let i = 0; i < drawable.length; i++) {
      try {
        const b = drawable[i].getBBox();
        const a = Math.max(0, b.width) * Math.max(0, b.height);
        if (a > outerArea) {
          outerArea = a;
          outerIndex = i;
        }
      } catch {
        // ignore
      }
    }

    // Treat as "outer silhouette" if it covers most of viewBox OR it's the only shape.
    const isOuterSilhouette = drawable.length === 1 || (outerArea / vbArea > 0.55);

    // Helper: make a data-url SVG where only selected elements are filled
    const makeSvgUrl = (mode: 'outerOnly' | 'holesOnly'): string => {
      const clone = svgImported.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('preserveAspectRatio', 'none');

      const els = Array.from(
        clone.querySelectorAll('path, polygon, polyline, rect, circle, ellipse')
      ) as SVGGraphicsElement[];

      for (let i = 0; i < els.length; i++) {
        const el = els[i];

        // IMPORTANT: inline style overrides attributes; remove it
        el.removeAttribute('style');

        // Make it a clean filled shape
        el.setAttribute('stroke', 'none');
        el.setAttribute('stroke-width', '0');

        const shouldFill =
          mode === 'outerOnly'
            ? i === outerIndex
            : (isOuterSilhouette ? i !== outerIndex : true);

        if (shouldFill) {
          el.setAttribute('fill', '#ffffff'); // opaque => alpha 1 in raster
        } else {
          el.setAttribute('fill', 'none'); // transparent
        }
      }

      const serialized = new XMLSerializer().serializeToString(clone);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    };

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(targetW));
    canvas.height = Math.max(1, Math.floor(targetH));
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
    if (!ctx) {
      document.body.removeChild(holder);
      return null;
    }

    const drawSvg = async (url: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load SVG image'));
        img.src = url;
      });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    // Build ALPHA mask:
    // - if we have an outer silhouette: start opaque everywhere (holes),
    //   carve the silhouette interior to transparent (keep), then add holes back.
    // - else: start transparent (keep) and draw holes as opaque.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isOuterSilhouette) {
      // Start as fully "hole"
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear inside outer silhouette => keep
      ctx.globalCompositeOperation = 'destination-out';
      await drawSvg(makeSvgUrl('outerOnly'));

      // Add inner holes (opaque) back in
      ctx.globalCompositeOperation = 'source-over';
      if (drawable.length > 1) {
        await drawSvg(makeSvgUrl('holesOnly'));
      }
    } else {
      // Hole-only: draw holes onto transparent keep
      ctx.globalCompositeOperation = 'source-over';
      await drawSvg(makeSvgUrl('holesOnly'));
    }

    ctx.globalCompositeOperation = 'source-over';
    
    // INVERT: The shader discards where alpha > 0.5, so we need:
    // - Holes = white/opaque (alpha 1.0) => will be discarded
    // - Keep = black/transparent (alpha 0.0) => will be kept
    // Current mask is inverted, so invert the alpha channel
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      // Invert alpha channel (keep RGB for debugging, but alpha is what matters)
      data[i] = 255 - data[i];
    }
    ctx.putImageData(imageData, 0, 0);
    
    document.body.removeChild(holder);

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    return tex;
  }

  private static async loadDiecutMaskForPlate(
    plate: ParserPlate,
    jobId: string,
    cardPx: CardPx
  ): Promise<THREE.Texture | null> {
    // 1) PNG mask first (only if this plate is a DIECUT_MASK)
    if (plate.type === 'DIECUT_MASK') {
      const pngUrl = this.getPlateImageUrl(plate, jobId);
      if (pngUrl) {
        try {
          return await this.loadMask(pngUrl);
        } catch (e) {
          console.warn('[ResourceManager] Failed to load diecut PNG:', pngUrl, e);
        }
      }
    }

    // 2) SVG -> rasterized mask
    const svgUrl = this.getPlateSvgUrl(plate, jobId);
    if (!svgUrl) return null;

    const cacheKey = `${svgUrl}|${cardPx.w}|${cardPx.h}`;
    const cached = this.diecutMaskCache.get(cacheKey);
    if (cached) return cached;

    let svgText = this.loadedSvgText.get(svgUrl) || null;
    if (!svgText) {
      const res = await fetch(svgUrl);
      if (!res.ok) {
        console.warn('[ResourceManager] Failed to fetch diecut SVG:', svgUrl, res.status, res.statusText);
        return null;
      }
      svgText = await res.text();
      this.loadedSvgText.set(svgUrl, svgText);
    }

    const tex = await this.rasterizeDiecutSvgMask(svgText, cardPx.w, cardPx.h);
    if (tex) this.diecutMaskCache.set(cacheKey, tex);
    return tex;
  }

  private static async loadDiecutMaskFromPlate(
    plate: ParserPlate,
    jobId: string,
    cardSize: CardPx
  ): Promise<THREE.Texture | null> {
    const svgUrl = this.getPlateSvgUrl(plate, jobId);
  
    if (svgUrl) {
      const cacheKey = `${svgUrl}|${cardSize.w}|${cardSize.h}`;
      const cached = this.diecutSvgMaskCache.get(cacheKey);
      if (cached) return cached;
  
      try {
        console.log('[ResourceManager] DIECUT mask: trying SVG', svgUrl);
        const res = await fetch(svgUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  
        const svgText = await res.text();
        const tex = await this.rasterizeDiecutSvgToFilledMask(svgText, cardSize.w, cardSize.h);
  
        if (tex) {
          this.diecutSvgMaskCache.set(cacheKey, tex);
          console.log('[ResourceManager] DIECUT mask: using FILLED SVG mask');
          return tex;
        }
  
        console.warn('[ResourceManager] DIECUT mask: SVG rasterize returned null, falling back to PNG');
      } catch (e) {
        console.warn('[ResourceManager] DIECUT mask: SVG failed, falling back to PNG', e);
      }
    } else {
      console.warn('[ResourceManager] DIECUT mask: no SVG URL found, falling back to PNG', {
        plateId: plate.id,
        assets: (plate as any).assets,
        file: (plate as any).file,
      });
    }
  
    // PNG fallback (might be outline-only, but better than nothing)
    const url = this.getPlateImageUrl(plate, jobId);
    if (!url) return null;
  
    try {
      console.log('[ResourceManager] DIECUT mask: using PNG', url);
      return await this.loadMask(url);
    } catch (e) {
      console.warn('[ResourceManager] Failed to load diecut PNG mask:', e);
      return null;
    }
  }  

  private static async rasterizeDiecutSvgToFilledMask(
    svgText: string,
    targetW: number,
    targetH: number
  ): Promise<THREE.Texture | null> {
    if (typeof document === 'undefined') return null;
  
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  
    svg.setAttribute('width', String(targetW));
    svg.setAttribute('height', String(targetH));
    svg.setAttribute('preserveAspectRatio', 'none');
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${targetW} ${targetH}`);
  
    // Attach offscreen so getBBox works reliably
    const holder = document.createElement('div');
    holder.style.position = 'absolute';
    holder.style.left = '-10000px';
    holder.style.top = '-10000px';
    holder.style.opacity = '0';
    document.body.appendChild(holder);
    holder.appendChild(svg);
  
    const els = Array.from(svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline')) as SVGGraphicsElement[];
    if (els.length === 0) {
      holder.remove();
      return null;
    }
  
    // Compute largest bbox (potential "outer silhouette")
    const vb = svg.viewBox.baseVal;
    const vbW = vb && vb.width > 0 ? vb.width : targetW;
    const vbH = vb && vb.height > 0 ? vb.height : targetH;
    const vbArea = Math.max(1e-6, vbW * vbH);
  
    let largest: SVGGraphicsElement | null = null;
    let largestArea = 0;
  
    for (const el of els) {
      try {
        const bb = el.getBBox();
        const a = Math.abs(bb.width * bb.height);
        if (a > largestArea) {
          largestArea = a;
          largest = el;
        }
      } catch {
        // ignore
      }
    }
  
    const looksLikeOuterSilhouette = !!largest && els.length > 1 && (largestArea / vbArea) > 0.80;
  
    // FORCE FILLED MASK:
    // - remove inline style (critical, otherwise fill:none wins)
    // - remove stroke
    // - fill white for hole shapes
    for (const el of els) {
      el.removeAttribute('style');
      el.setAttribute('stroke', 'none');
      el.setAttribute('stroke-width', '0');
      el.setAttribute('fill', '#ffffff');
    }
  
    // If we detected an outer silhouette, do NOT fill it (we want holes, not full-card cutout)
    if (looksLikeOuterSilhouette && largest) {
      largest.setAttribute('fill', 'none');
    }
  
    const serialized = new XMLSerializer().serializeToString(svg);
    holder.remove();
  
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(targetW));
    canvas.height = Math.max(1, Math.floor(targetH));
  
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load SVG for diecut rasterization'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    });
  
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
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
          
          // Check if rect would place the image completely out of bounds
          const isOutOfBounds = rect.x0 >= canvas.width || rect.y0 >= canvas.height ||
                                rect.x0 + drawW < 0 || rect.y0 + drawH < 0;
          
          // Also check if image is already close to card size (full-card print)
          // In this case, ignore rect and draw at (0,0)
          const isSimilarToCardSize = 
            Math.abs(imgW - canvas.width) < canvas.width * 0.1 && 
            Math.abs(imgH - canvas.height) < canvas.height * 0.1;

          if (isOutOfBounds || isSimilarToCardSize) {
            console.log(`[ResourceManager] Print ${plate.id}: rect out of bounds or full-card sized, placing at (0,0)`, {
              rect: { x0: rect.x0, y0: rect.y0, w: drawW, h: drawH },
              cardSize: { w: canvas.width, h: canvas.height },
              imgSize: { w: imgW, h: imgH },
              isOutOfBounds,
              isSimilarToCardSize
            });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } else {
            console.log(`[ResourceManager] Drawing print plate ${plate.id}: imgSize=${imgW}x${imgH}, rect=${rect.x0},${rect.y0} size=${drawW}x${drawH}`);
            ctx.drawImage(img, rect.x0, rect.y0, drawW, drawH);
          }
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
          texture.flipY = true;
    texture.rotation = 0; // No rotation - use UVs directly from geometry
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
        // NOTE: rect coordinates may be artboard-relative (not card-relative)
        // If rect is out of card bounds, fall back to placing at (0,0)
        let startX = rect ? rect.x0 : 0;
        let startY = rect ? rect.y0 : 0;
        const imgW = tempCanvas.width;
        const imgH = tempCanvas.height;

        // Check if rect would place the mask completely out of bounds
        const isOutOfBounds = startX >= canvas.width || startY >= canvas.height ||
                              startX + imgW < 0 || startY + imgH < 0;
        
        // Also check if mask is already close to card size (full-card mask)
        // In this case, ignore rect and draw at (0,0)
        const isSimilarToCardSize = 
          Math.abs(imgW - canvas.width) < canvas.width * 0.1 && 
          Math.abs(imgH - canvas.height) < canvas.height * 0.1;

        if (isOutOfBounds || isSimilarToCardSize) {
          console.log(`[ResourceManager] Mask ${plate.id}: rect out of bounds or full-card sized, placing at (0,0)`, {
            rect: rect ? { x0: rect.x0, y0: rect.y0, w: rect.w, h: rect.h } : null,
            cardSize: { w: canvas.width, h: canvas.height },
            imgSize: { w: imgW, h: imgH },
            isOutOfBounds,
            isSimilarToCardSize
          });
          startX = 0;
          startY = 0;
        } else {
          console.log(`[ResourceManager] Mask ${plate.id}: using rect placement`, {
            startX, startY, imgW, imgH, canvasW: canvas.width, canvasH: canvas.height
          });
        }

        let writtenPixels = 0;
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
              writtenPixels++;
            }
          }
        }
        console.log(`[ResourceManager] Mask ${plate.id}: wrote ${writtenPixels} pixels out of ${imgW * imgH} total`);
      } catch (error) {
        console.warn(`[ResourceManager] Failed to load mask plate ${plate.id}:`, error);
      }
    }

    // Write accumulated data to canvas
    const out = ctx.createImageData(canvas.width, canvas.height);
    out.data.set(accum);
    ctx.putImageData(out, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = true; // IMPORTANT: match print orientation (prints use flipY=true)
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
      try {
        diecutMask = await this.loadDiecutMaskFromPlate(plyStack.front.diecut, jobId, cardSize);
      } catch (error) {
        console.warn(`[ResourceManager] Failed to build diecut mask (front):`, error);
      }
    } else if (plyStack.back.diecut) {
      try {
        diecutMask = await this.loadDiecutMaskFromPlate(plyStack.back.diecut, jobId, cardSize);
      } catch (error) {
        console.warn(`[ResourceManager] Failed to build diecut mask (back):`, error);
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
