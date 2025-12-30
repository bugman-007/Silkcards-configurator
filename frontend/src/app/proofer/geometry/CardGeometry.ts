import * as THREE from 'three';

/**
 * Ply thickness constant: 16pt = 5.644mm
 * 1 pt = 1/72 inch, 16 pt = 16/72 inch = 0.2222 inch
 * 0.2222 inch × 25.4 mm/in = 5.644 mm
 */
export const PLY_THICKNESS_MM = 0.5644; // 16pt stock

/**
 * Procedural Card Geometry Generator - Proofer
 * Creates dynamic card meshes with rounded corners, proper UVs, and thickness
 * 
 * UVs are always in 0-1 range and scale with card size to match artwork scaling
 * Each ply has a fixed thickness of 16pt (5.644mm)
 */
export class CardGeometry {
  private _geometry: THREE.BufferGeometry;
  private width: number;
  private height: number;
  private thickness: number; // Total thickness (will be divided by plyCount)
  private cornerRadius: number;
  private plyCount: number; // Number of plies
  private cornerSegments: number = 8;
  private spacingMultiplier: number = 1.0; // Multiplier for layer spacing (dev mode: 2.5cm spacing)
  // Optional die-cut outlines (SVG-derived) in card-local XY; used to build interior walls
  private diecutOutlines: Array<Array<THREE.Vector2>> | null = null;

  /**
   * Constructor with options object
   * Uses dimensions as-is from the JSON (no hardcoded rotation)
   * Supports multi-ply: creates separate front/back faces per ply with z-offsets
   */
  constructor(options: {
    width: number;
    height: number;
    thickness: number;
    cornerRadius: number;
    plyCount?: number; // Number of plies (default: 1)
    spacingMultiplier?: number; // Multiplier for layer spacing (default: 1.0)
  }) {
    this.width = options.width;
    this.height = options.height;
    this.thickness = options.thickness;
    this.cornerRadius = options.cornerRadius;
    this.plyCount = options.plyCount || 1;
    this.spacingMultiplier = options.spacingMultiplier ?? 1.0;
    this._geometry = new THREE.BufferGeometry();
    this.buildGeometry();
  }

  /**
   * Update card dimensions and rebuild geometry
   */
  updateDimensions(width: number, height: number, thickness: number, cornerRadius: number, plyCount?: number, spacingMultiplier?: number): void {
    this.width = width;
    this.height = height;
    this.thickness = thickness;
    this.cornerRadius = cornerRadius;
    if (plyCount !== undefined) {
      this.plyCount = plyCount;
    }
    if (spacingMultiplier !== undefined) {
      this.spacingMultiplier = spacingMultiplier;
    }
    this.rebuildGeometry();
  }

  /**
   * Set die-cut outlines (from SVG) and rebuild geometry.
   * Pass null/empty to remove die-cut interior walls.
   */
  setDiecutOutlines(outlines: Array<Array<THREE.Vector2>> | null): void {
    this.diecutOutlines = outlines && outlines.length ? outlines : null;
    this.rebuildGeometry();
  }

  // Top anchor: export class CardGeometry {

  private getRoundedRectContourVec2(): THREE.Vector2[] {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const r = Math.min(this.cornerRadius, halfW, halfH);
    const seg = Math.max(4, this.cornerSegments);

    const pts: THREE.Vector2[] = [];
    const corner = (cx: number, cy: number, a0: number, a1: number) => {
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const a = a0 + (a1 - a0) * t;
        pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
      }
    };

    corner(halfW - r, halfH - r, 0, Math.PI / 2);
    corner(-halfW + r, halfH - r, Math.PI / 2, Math.PI);
    corner(-halfW + r, -halfH + r, Math.PI, 3 * Math.PI / 2);
    corner(halfW - r, -halfH + r, 3 * Math.PI / 2, 2 * Math.PI);

    // de-dupe
    const out: THREE.Vector2[] = [];
    const EPS = 1e-6;
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || last.distanceToSquared(p) > EPS) out.push(p);
    }
    if (out.length >= 2 && out[0].distanceToSquared(out[out.length - 1]) < EPS) out.pop();
    return out;
  }

  /**
   * Extruded geometry for a ply. If diecutOutlines provided, they become holes.
   * Returns geometry centered at z=0 plus centerZ for stacking.
   *
   * Materials order: [sides, top(+z), bottom(-z)]
   */
  createPlyExtrudedGeometry(
    plyIndex: number,
    diecutOutlines?: THREE.Vector2[][] // if omitted, uses this.diecutOutlines
  ): { geometry: THREE.ExtrudeGeometry; centerZ: number } {
  
    const plyThickness = PLY_THICKNESS_MM;
    const spacingBetweenPlies = plyThickness * this.spacingMultiplier;
  
    const totalStackHeight = spacingBetweenPlies * this.plyCount;
    const totalHalfStackHeight = totalStackHeight / 2;
    const centerZ = totalHalfStackHeight - (plyIndex + 0.5) * spacingBetweenPlies;
  
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const eps = Math.min(this.width, this.height) * 0.01; // 1% tolerance
  
    const normalizeLoop = (pts: THREE.Vector2[]): THREE.Vector2[] => {
      const out: THREE.Vector2[] = [];
      for (const p of pts) {
        const v = new THREE.Vector2(p.x, p.y);
        if (out.length === 0 || out[out.length - 1].distanceToSquared(v) > 1e-10) out.push(v);
      }
      if (out.length >= 2 && out[0].distanceToSquared(out[out.length - 1]) < 1e-10) out.pop();
      return out;
    };
  
    const bbox = (pts: THREE.Vector2[]) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    };
  
    // If an outline is basically the full card bounds, it is NOT a hole.
    const isCardSilhouetteLike = (ptsIn: THREE.Vector2[]) => {
      const pts = normalizeLoop(ptsIn);
      if (pts.length < 3) return false;
      const b = bbox(pts);
      return (
        Math.abs(b.minX + halfW) < eps &&
        Math.abs(b.maxX - halfW) < eps &&
        Math.abs(b.minY + halfH) < eps &&
        Math.abs(b.maxY - halfH) < eps
      );
    };
  
    // ---- Outer silhouette is ALWAYS the card rounded-rect ----
    let contour = normalizeLoop(this.getRoundedRectContourVec2());
    if (contour.length < 3) contour = [
      new THREE.Vector2(-halfW,  halfH),
      new THREE.Vector2( halfW,  halfH),
      new THREE.Vector2( halfW, -halfH),
      new THREE.Vector2(-halfW, -halfH),
    ];
  
    // Three triangulation expects: contour CCW, holes CW
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  
    const shape = new THREE.Shape();
    shape.moveTo(contour[0].x, contour[0].y);
    for (let i = 1; i < contour.length; i++) shape.lineTo(contour[i].x, contour[i].y);
    shape.closePath();
  
    // ---- Holes come from SVG diecut outlines ----
    const rawOutlines = (diecutOutlines ?? this.diecutOutlines ?? []).filter(o => o && o.length >= 3);
    const holes = rawOutlines
      .map(normalizeLoop)
      .filter(o => o.length >= 3)
      .filter(o => !isCardSilhouetteLike(o)); // never treat card-silhouette as hole
  
    for (const holePts0 of holes) {
      let holePts = normalizeLoop(holePts0);
      if (holePts.length < 3) continue;
  
      // holes CW
      if (!THREE.ShapeUtils.isClockWise(holePts)) holePts.reverse();
  
      const path = new THREE.Path();
      path.moveTo(holePts[0].x, holePts[0].y);
      for (let i = 1; i < holePts.length; i++) path.lineTo(holePts[i].x, holePts[i].y);
      path.closePath();
  
      shape.holes.push(path);
    }
  
    const UVGen = {
      generateTopUV: (_g: any, verts: number[], ia: number, ib: number, ic: number) => {
        const ax = verts[ia * 3], ay = verts[ia * 3 + 1];
        const bx = verts[ib * 3], by = verts[ib * 3 + 1];
        const cx = verts[ic * 3], cy = verts[ic * 3 + 1];
        return [
          new THREE.Vector2((ax + halfW) / this.width, (ay + halfH) / this.height),
          new THREE.Vector2((bx + halfW) / this.width, (by + halfH) / this.height),
          new THREE.Vector2((cx + halfW) / this.width, (cy + halfH) / this.height),
        ];
      },
      generateSideWallUV: () => [
        new THREE.Vector2(0, 0), new THREE.Vector2(0, 0),
        new THREE.Vector2(0, 0), new THREE.Vector2(0, 0),
      ],
    };
  
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: plyThickness,
      steps: 1,
      bevelEnabled: false,
      UVGenerator: UVGen as any,
    });
  
    // center around z=0
    geometry.translate(0, 0, -plyThickness / 2);
    geometry.computeVertexNormals();
  
    // ---- Fix mirrored BACK: flip U only for bottom-cap vertices ----
    const nAttr = geometry.attributes.normal as THREE.BufferAttribute | undefined;
    const uvAttr = geometry.attributes.uv as THREE.BufferAttribute | undefined;
    if (nAttr && uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        const nz = nAttr.getZ(i);
        if (nz < -0.85) {
          uvAttr.setX(i, 1.0 - uvAttr.getX(i));
        }
      }
      uvAttr.needsUpdate = true;
    }
  
    // ---- Ensure materials map correctly: [sides, front(+z), back(-z)] ----
    const idxAttr = geometry.getIndex();
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    if (idxAttr && posAttr) {
      const src = idxAttr.array as unknown as ArrayLike<number>;
      const sides: number[] = [];
      const front: number[] = [];
      const back: number[] = [];
  
      const triNormalZ = (i0: number, i1: number, i2: number) => {
        const ax = posAttr.getX(i0), ay = posAttr.getY(i0), az = posAttr.getZ(i0);
        const bx = posAttr.getX(i1), by = posAttr.getY(i1), bz = posAttr.getZ(i1);
        const cx = posAttr.getX(i2), cy = posAttr.getY(i2), cz = posAttr.getZ(i2);
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        // cross(ab, ac)
        const nz = abx * acy - aby * acx;
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        return nz / len;
      };
  
      for (let t = 0; t < src.length; t += 3) {
        const i0 = Number(src[t]);
        const i1 = Number(src[t + 1]);
        const i2 = Number(src[t + 2]);
  
        const nz = triNormalZ(i0, i1, i2);
        if (Math.abs(nz) > 0.85) {
          if (nz > 0) front.push(i0, i1, i2);
          else back.push(i0, i1, i2);
        } else {
          sides.push(i0, i1, i2);
        }
      }
  
      const merged = sides.concat(front, back);
      const needs32 = posAttr.count > 65535;
      const typed = needs32 ? new Uint32Array(merged) : new Uint16Array(merged);
  
      geometry.setIndex(new THREE.BufferAttribute(typed, 1));
      geometry.clearGroups();
      geometry.addGroup(0, sides.length, 0);
      geometry.addGroup(sides.length, front.length, 1);
      geometry.addGroup(sides.length + front.length, back.length, 2);
    }
  
    return { geometry, centerZ };
  }
  

  /**
   * Get the Three.js geometry (getter property)
   */
  get geometry(): THREE.BufferGeometry {
    return this._geometry;
  }

  /**
   * True when we have SVG-derived diecut outlines loaded.
   */
  usesDiecutGeometry(): boolean {
    return !!this.diecutOutlines && this.diecutOutlines.length > 0;
  }

  /**
   * Create box geometry for a specific ply (with actual thickness)
   * Used in multi-ply architecture where each mesh is a full box (not just a face)
   * 
   * @param plyIndex - The ply index (0, 1, 2, ...)
   * @returns Object with geometry and centerZ position (mesh should be positioned at centerZ)
   */
  createPlyBoxGeometry(plyIndex: number): { geometry: THREE.BoxGeometry; centerZ: number } {
    // Each ply has fixed thickness of 16pt (5.644mm)
    const plyThickness = PLY_THICKNESS_MM;
    
    // Apply spacing multiplier for dev mode (2.5cm = 25mm spacing between ply centers)
    // When spacingMultiplier = 1.0, plies are stacked with normal thickness
    const spacingBetweenPlies = plyThickness * this.spacingMultiplier;
    const totalStackHeight = spacingBetweenPlies * this.plyCount;
    const totalHalfStackHeight = totalStackHeight / 2;

    // Z-offset for this ply center (using spacing multiplier)
    // Reverse order: ply 0 is in front (+Z), higher indices are behind (-Z)
    // centerZ = totalHalfStackHeight - (plyIndex + 0.5) * spacingBetweenPlies
    const centerZ = totalHalfStackHeight - (plyIndex + 0.5) * spacingBetweenPlies;
    
    // Create box geometry - card dimensions with actual thickness
    // BoxGeometry is centered at origin by default, we'll position the mesh at centerZ
    const geometry = new THREE.BoxGeometry(this.width, this.height, plyThickness);
    
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return { geometry, centerZ };
  }


  /**
   * Build an extruded ply shape:
   * - Outer contour is the card rounded-rect (fallback) OR SVG outer silhouette if present.
   * - Holes come from SVG diecut outlines.
   * - Returns geometry centered around z=0 and a centerZ position consistent with existing ply stacking.
   *
   * Materials order (ExtrudeGeometry groups):
   *   [0] sides
   *   [1] top cap  (+z)  -> FRONT
   *   [2] bottom cap (-z) -> BACK
   */
  public createPlyExtrudedGeometryFromDiecut(
    plyIndex: number,
    diecutOutlines: THREE.Vector2[][],
  ): { geometry: THREE.ExtrudeGeometry; centerZ: number } {
    const plyThickness = PLY_THICKNESS_MM;
    const spacingBetweenPlies = plyThickness * this.spacingMultiplier;

    const totalStackHeight = spacingBetweenPlies * this.plyCount;
    const totalHalfStackHeight = totalStackHeight / 2;
    const centerZ = totalHalfStackHeight - (plyIndex + 0.5) * spacingBetweenPlies;

    const outerFallback = this.getRoundedRectContourVec2_();

    // --- helpers ---
    const sanitize = (pts: THREE.Vector2[]): THREE.Vector2[] => {
      if (!pts || pts.length < 3) return [];
      const out: THREE.Vector2[] = [];
      const EPS = 1e-6;
      for (const p of pts) {
        const last = out[out.length - 1];
        if (!last || last.distanceToSquared(p) > EPS) out.push(p.clone());
      }
      if (out.length >= 2 && out[0].distanceToSquared(out[out.length - 1]) < EPS) out.pop();
      return out.length >= 3 ? out : [];
    };

    const area = (pts: THREE.Vector2[]) => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
      }
      return 0.5 * a;
    };

    const outlines = (diecutOutlines || []).map(sanitize).filter(o => o.length >= 3);

    // Decide if SVG provides the OUTER silhouette or only HOLES.
    const cardArea = Math.max(1e-6, this.width * this.height);
    let outer = outerFallback;
    let holes: THREE.Vector2[][] = [];

    if (outlines.length > 0) {
      let largest = outlines[0];
      let best = Math.abs(area(largest));
      for (const o of outlines) {
        const a = Math.abs(area(o));
        if (a > best) { best = a; largest = o; }
      }

      const isOuterSilhouette = (best / cardArea) > 0.55;

      if (isOuterSilhouette) {
        outer = largest;
        holes = outlines.filter(o => o !== largest);
      } else {
        outer = outerFallback;
        holes = outlines; // hole-only SVG
      }
    }

    // Ensure winding: outer CCW, holes CW (Three expects this)
    const ensureCCW = (pts: THREE.Vector2[]) => (area(pts) < 0 ? pts.slice().reverse() : pts.slice());
    const ensureCW  = (pts: THREE.Vector2[]) => (area(pts) > 0 ? pts.slice().reverse() : pts.slice());

    const outerPts = ensureCCW(outer);

    const shape = new THREE.Shape();
    shape.moveTo(outerPts[0].x, outerPts[0].y);
    for (let i = 1; i < outerPts.length; i++) shape.lineTo(outerPts[i].x, outerPts[i].y);
    shape.closePath();

    for (const hRaw of holes) {
      const h = ensureCW(hRaw);
      if (h.length < 3) continue;
      const path = new THREE.Path();
      path.moveTo(h[0].x, h[0].y);
      for (let i = 1; i < h.length; i++) path.lineTo(h[i].x, h[i].y);
      path.closePath();
      shape.holes.push(path);
    }

    // UVs for caps: map XY->UV like your existing print mapping (card centered at 0,0)
    const halfW = this.width / 2;
    const halfH = this.height / 2;

    const UVGen = {
      generateTopUV: (_g: any, verts: number[], ia: number, ib: number, ic: number) => {
        const ax = verts[ia * 3], ay = verts[ia * 3 + 1];
        const bx = verts[ib * 3], by = verts[ib * 3 + 1];
        const cx = verts[ic * 3], cy = verts[ic * 3 + 1];
        return [
          new THREE.Vector2((ax + halfW) / this.width, (ay + halfH) / this.height),
          new THREE.Vector2((bx + halfW) / this.width, (by + halfH) / this.height),
          new THREE.Vector2((cx + halfW) / this.width, (cy + halfH) / this.height),
        ];
      },
      generateSideWallUV: () => [
        new THREE.Vector2(0, 0), new THREE.Vector2(0, 0),
        new THREE.Vector2(0, 0), new THREE.Vector2(0, 0),
      ],
    };

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: plyThickness,
      steps: 1,
      bevelEnabled: false,
      UVGenerator: UVGen as any,
    });

    // Center around z=0 so mesh.position.z=centerZ matches your existing stacking
    geometry.translate(0, 0, -plyThickness / 2);
    geometry.computeVertexNormals();

    return { geometry, centerZ };
  }

  /**
   * Rounded-rect contour in local card space centered at (0,0).
   * Kept private to avoid collisions with your existing helpers.
   */
  private getRoundedRectContourVec2_(): THREE.Vector2[] {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const r = Math.min(this.cornerRadius, halfW, halfH);
    const seg = Math.max(4, this.cornerSegments);

    const pts: THREE.Vector2[] = [];
    const corner = (cx: number, cy: number, a0: number, a1: number) => {
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const a = a0 + (a1 - a0) * t;
        pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
      }
    };

    corner(halfW - r, halfH - r, 0, Math.PI / 2);
    corner(-halfW + r, halfH - r, Math.PI / 2, Math.PI);
    corner(-halfW + r, -halfH + r, Math.PI, 3 * Math.PI / 2);
    corner(halfW - r, -halfH + r, 3 * Math.PI / 2, 2 * Math.PI);

    // Remove duplicate closure if present
    const out: THREE.Vector2[] = [];
    const EPS = 1e-6;
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || last.distanceToSquared(p) > EPS) out.push(p);
    }
    if (out.length >= 2 && out[0].distanceToSquared(out[out.length - 1]) < EPS) out.pop();
    return out;
  }


  /**
   * Create geometry for a specific ply/face combination (DEPRECATED - use createPlyBoxGeometry)
   * Kept for backward compatibility during transition
   * 
   * @param plyIndex - The ply index (0, 1, 2, ...)
   * @param face - 'front' or 'back' (ignored - returns full box)
   * @returns A new BufferGeometry for this specific ply/face
   * @deprecated Use createPlyBoxGeometry instead to get actual thickness
   */
  createPlyFaceGeometry(plyIndex: number, face: 'front' | 'back'): THREE.BufferGeometry {
    // Return a box geometry (this method is being phased out)
    // The face parameter is ignored - we create a full box now
    const { geometry } = this.createPlyBoxGeometry(plyIndex);
    return geometry;
  }

  /**
   * Normalize a closed contour (remove duplicates, ensure proper closure)
   */
  private normalizeClosedContour(raw: THREE.Vector2[]): THREE.Vector2[] {
    if (!raw || raw.length < 3) return [];
    const pts = raw.slice();
    const EPS = 1e-6;
    const last = pts[pts.length - 1];
    if (pts[0].distanceToSquared(last) < EPS) pts.pop();
    return pts.length >= 3 ? pts : [];
  }

  /**
   * If largest outline covers most of the card -> treat as OUTER silhouette.
   * Otherwise outlines are HOLES only.
   */
  private splitDiecutContours(outerFallback: THREE.Vector2[]): { outer: THREE.Vector2[]; holes: THREE.Vector2[][] } {
    const cleaned = (this.diecutOutlines || [])
      .map((o) => this.sanitizeContour(o))
      .filter((o) => o.length >= 3);

    if (cleaned.length === 0) return { outer: outerFallback, holes: [] };

    const cardArea = Math.max(1e-6, this.width * this.height);

    let largest = cleaned[0];
    let largestA = Math.abs(this.signedArea2D(largest));
    for (const c of cleaned) {
      const a = Math.abs(this.signedArea2D(c));
      if (a > largestA) {
        largestA = a;
        largest = c;
      }
    }

    const isOuter = (largestA / cardArea) > 0.55;

    if (isOuter) {
      return { outer: largest, holes: cleaned.filter((c) => c !== largest) };
    }
    return { outer: outerFallback, holes: cleaned };
  }

  /**
   * Rounded-rect contour in card space (centered at 0,0) to match your existing UV mapping.
   */
  private getRoundedRectContourForExtrude(): THREE.Vector2[] {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const r = Math.min(this.cornerRadius, halfW, halfH);
    const seg = Math.max(4, this.cornerSegments);

    const pts: THREE.Vector2[] = [];

    const corner = (cx: number, cy: number, a0: number, a1: number) => {
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const a = a0 + (a1 - a0) * t;
        pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
      }
    };

    corner(halfW - r, halfH - r, 0, Math.PI / 2);
    corner(-halfW + r, halfH - r, Math.PI / 2, Math.PI);
    corner(-halfW + r, -halfH + r, Math.PI, 3 * Math.PI / 2);
    corner(halfW - r, -halfH + r, 3 * Math.PI / 2, 2 * Math.PI);

    return this.normalizeClosedContour(pts);
  }

  /**
   * Build a face for a specific ply (simplified version without faceType/plyIndex arrays)
   * @param reverseWinding - If true, reverse triangle winding for back faces (required for FrontSide culling)
   */
  private buildFaceForPlyWithWinding(
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[],
    halfWidth: number,
    halfHeight: number,
    z: number,
    normal: [number, number, number],
    reverseWinding: boolean = false
  ): void {
    const startIndex = positions.length / 3;
    const effectiveWidth = this.width;
    const effectiveHeight = this.height;

    // Generate outline points with rounded corners
    const outlinePoints: Array<{ x: number; y: number; u: number; v: number }> = [];

    // Top-right corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments);
      const x = halfWidth - this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = halfHeight - this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Top-left corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + Math.PI / 2;
      const x = -halfWidth + this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = halfHeight - this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Bottom-left corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + Math.PI;
      const x = -halfWidth + this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = -halfHeight + this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Bottom-right corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + (3 * Math.PI) / 2;
      const x = halfWidth - this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = -halfHeight + this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Add center vertex
    positions.push(0, 0, z);
    normals.push(...normal);
    uvs.push(0.5, 0.5);

    // Add outline vertices
    for (const point of outlinePoints) {
      positions.push(point.x, point.y, z);
      normals.push(...normal);
      uvs.push(point.u, point.v);
    }

    // Create triangles from center to outline
    // Winding order determines which side is "front" for culling
    // CCW winding = front visible from +Z (for front faces)
    // CW winding (reversed) = front visible from -Z (for back faces)
    const numOutlineVerts = outlinePoints.length;
    for (let i = 0; i < numOutlineVerts; i++) {
      const next = (i + 1) % numOutlineVerts;
      if (reverseWinding) {
        // CW winding for back faces (visible from -Z direction)
        indices.push(
          startIndex,
          startIndex + 1 + next,
          startIndex + 1 + i
        );
      } else {
        // CCW winding for front faces (visible from +Z direction)
        indices.push(
          startIndex,
          startIndex + 1 + i,
          startIndex + 1 + next
        );
      }
    }
  }

  /**
   * Build the complete card geometry with front, back, and sides
   * Called only during initial construction
   */
  private buildGeometry(): void {
    this._geometry = new THREE.BufferGeometry();
    this.rebuildGeometry();
  }

  // ============================================================
  // DIECUT SHAPE SUPPORT (SVG outlines -> silhouette + holes)
  // ============================================================

  private sanitizeContour(pts: Array<THREE.Vector2>): Array<THREE.Vector2> {
    if (!pts || pts.length < 3) return [];
    const out: THREE.Vector2[] = [];
    const EPS = 1e-5;

    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || last.distanceTo(p) > EPS) out.push(p.clone());
    }

    if (out.length >= 2 && out[0].distanceTo(out[out.length - 1]) <= EPS) {
      out.pop();
    }
    return out.length >= 3 ? out : [];
  }

  private signedArea2D(pts: Array<THREE.Vector2>): number {
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5;
  }

  /**
   * Interprets diecutOutlines:
   * - If largest outline ~ covers card => treat as OUTER silhouette, rest = holes
   * - Else => all outlines are holes only
   */
  private computeDiecutContours(): {
    outer: Array<THREE.Vector2> | null;
    holes: Array<Array<THREE.Vector2>>;
    useShapeFaces: boolean;
  } {
    if (!this.diecutOutlines || this.diecutOutlines.length === 0) {
      return { outer: null, holes: [], useShapeFaces: false };
    }

    const cardArea = Math.max(1e-6, this.width * this.height);
    const cleaned = this.diecutOutlines
      .map((o) => this.sanitizeContour(o))
      .filter((o) => o.length >= 3);

    if (cleaned.length === 0) {
      return { outer: null, holes: [], useShapeFaces: false };
    }

    let outer = cleaned[0];
    let outerAbsArea = Math.abs(this.signedArea2D(outer));
    for (const o of cleaned) {
      const a = Math.abs(this.signedArea2D(o));
      if (a > outerAbsArea) {
        outerAbsArea = a;
        outer = o;
      }
    }

    const isOuter = outerAbsArea / cardArea > 0.55;
    if (isOuter) {
      const holes = cleaned.filter((o) => o !== outer);
      return { outer, holes, useShapeFaces: true };
    }

    return { outer: null, holes: cleaned, useShapeFaces: true };
  }

  private getRoundedRectContour(): Array<THREE.Vector2> {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const r = Math.min(this.cornerRadius, halfWidth, halfHeight);
    const seg = Math.max(2, this.cornerSegments);

    const pts: THREE.Vector2[] = [];
    const addCorner = (cx: number, cy: number, startA: number, endA: number) => {
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const a = startA + (endA - startA) * t;
        pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
      }
    };

    addCorner(halfWidth - r, halfHeight - r, 0, Math.PI / 2);
    addCorner(-halfWidth + r, halfHeight - r, Math.PI / 2, Math.PI);
    addCorner(-halfWidth + r, -halfHeight + r, Math.PI, (3 * Math.PI) / 2);
    addCorner(halfWidth - r, -halfHeight + r, (3 * Math.PI) / 2, 2 * Math.PI);

    return this.sanitizeContour(pts);
  }

  private buildFaceFromContours(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
    plyIndices: number[],
    indices: number[],
    outer: Array<THREE.Vector2>,
    holes: Array<Array<THREE.Vector2>>,
    z: number,
    normal: [number, number, number],
    faceType: number,
    plyIndex: number,
    reverseWinding: boolean
  ): void {
    const contour = this.sanitizeContour(outer);
    const holeList = holes.map((h) => this.sanitizeContour(h)).filter((h) => h.length >= 3);
    if (contour.length < 3) return;

    if (this.signedArea2D(contour) < 0) contour.reverse();
    for (const h of holeList) {
      if (this.signedArea2D(h) > 0) h.reverse();
    }

    const triangles = THREE.ShapeUtils.triangulateShape(contour, holeList);

    const allPts: THREE.Vector2[] = [...contour];
    for (const h of holeList) allPts.push(...h);

    const startIndex = positions.length / 3;
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;

    for (const p of allPts) {
      positions.push(p.x, p.y, z);
      normals.push(normal[0], normal[1], normal[2]);

      const u = (p.x + halfWidth) / this.width;
      const v = (p.y + halfHeight) / this.height;
      uvs.push(u, v);

      faceTypes.push(faceType);
      plyIndices.push(plyIndex);
    }

    for (const tri of triangles) {
      const a = startIndex + tri[0];
      const b = startIndex + tri[1];
      const c = startIndex + tri[2];
      if (reverseWinding) indices.push(a, c, b);
      else indices.push(a, b, c);
    }
  }

  private buildOuterSideFacesFromContour(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
    plyIndices: number[],
    indices: number[],
    contour: Array<THREE.Vector2>,
    halfThickness: number
  ): void {
    const pts = this.sanitizeContour(contour);
    if (pts.length < 3) return;

    const isCCW = this.signedArea2D(pts) > 0;
    const startIndex = positions.length / 3;
    const n = pts.length;

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const next = pts[(i + 1) % n];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);

      // outward normal (right side for CCW)
      const nx = segLen > 1e-6 ? (isCCW ? dy : -dy) / segLen : 0;
      const ny = segLen > 1e-6 ? (isCCW ? -dx : dx) / segLen : 0;

      positions.push(p.x, p.y, halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(-1.0, -1.0);
      faceTypes.push(2.0);
      plyIndices.push(0);

      positions.push(p.x, p.y, -halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(-1.0, -1.0);
      faceTypes.push(2.0);
      plyIndices.push(this.plyCount - 1);
    }

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const iFront = startIndex + i * 2;
      const iBack = startIndex + i * 2 + 1;
      const nextFront = startIndex + next * 2;
      const nextBack = startIndex + next * 2 + 1;

      indices.push(iFront, iBack, nextFront);
      indices.push(iBack, nextBack, nextFront);
    }
  }

  /**
   * Rebuild geometry by updating existing attributes in place
   * This ensures the mesh reference stays valid
   */
  private rebuildGeometry(): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const faceTypes: number[] = []; // 0 = front, 1 = back, 2 = edge
    const plyIndices: number[] = []; // Store ply index per vertex for material selection
    const indices: number[] = [];

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const unitThickness = this.thickness / this.plyCount; // Thickness per ply
    const totalHalfThickness = this.thickness / 2;

    const outerFallback = this.getRoundedRectContourVec2();
    const { outer, holes } = this.splitDiecutContours(outerFallback);

    // Build faces for each ply
    // Each ply gets a front face and back face, stacked with z-offsets
    for (let ply = 0; ply < this.plyCount; ply++) {
      // Z-offset for this ply: center the stack, then offset each ply
      const zOffset = -totalHalfThickness + (ply + 0.5) * unitThickness;
      const zFront = zOffset + unitThickness / 2;
      const zBack = zOffset - unitThickness / 2;

      // Front cap (geometry-cut)
      this.buildFaceFromContours(
        positions, normals, uvs, faceTypes, plyIndices, indices,
        outer, holes,
        zFront, [0, 0, 1],
        0.0, ply,
        false
      );

      // Back cap (geometry-cut)
      this.buildFaceFromContours(
        positions, normals, uvs, faceTypes, plyIndices, indices,
        outer, holes,
        zBack, [0, 0, -1],
        1.0, ply,
        true
      );
    }

    // Build side faces (thickness extrusion) - faceType = 2
    // Only build sides for the outer edges of the stack
    const hasDiecutOutlines = this.diecutOutlines && this.diecutOutlines.length > 0;
    if (hasDiecutOutlines && outer !== outerFallback) {
      // Use contour-based outer side faces when we have SVG-derived outer
      this.buildOuterSideFacesFromContour(
        positions,
        normals,
        uvs,
        faceTypes,
        plyIndices,
        indices,
        outer,
        totalHalfThickness
      );
    } else {
      this.buildSideFaces(
        positions,
        normals,
        uvs,
        faceTypes,
        plyIndices,
        indices,
        halfWidth,
        halfHeight,
        totalHalfThickness
      );
    }

    // Build die-cut interior walls (if any)
    if (holes.length > 0) {
      this.buildDiecutSideFaces(
        positions,
        normals,
        uvs,
        faceTypes,
        plyIndices,
        indices,
        totalHalfThickness,
        holes
      );
    }

    // Calculate vertex count
    const vertexCount = positions.length / 3;
    const indexCount = indices.length;

    // Validate: index count must not exceed vertex count
    if (indexCount > 0) {
      const maxIndex = Math.max(...indices);
      if (maxIndex >= vertexCount) {
        console.error(`CardGeometry: Invalid index reference! Max index ${maxIndex} >= vertex count ${vertexCount}`);
        throw new Error(`Geometry index buffer mismatch: indices reference vertices beyond available count`);
      }
    }

    // Get existing attributes
    const positionAttr = this._geometry.getAttribute('position') as THREE.BufferAttribute | null;
    const normalAttr = this._geometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvAttr = this._geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const faceTypeAttr = this._geometry.getAttribute('faceType') as THREE.BufferAttribute | null;
    const plyIndexAttr = this._geometry.getAttribute('plyIndex') as THREE.BufferAttribute | null;
    const existingIndex = this._geometry.getIndex();

    // Create typed arrays
    const positionArray = new Float32Array(positions);
    const normalArray = new Float32Array(normals);
    const uvArray = new Float32Array(uvs);
    const faceTypeArray = new Float32Array(faceTypes);
    const plyIndexArray = new Float32Array(plyIndices);

    // Determine if we need Uint16Array or Uint32Array for indices
    const maxIndexValue = indexCount > 0 ? Math.max(...indices) : 0;
    const useUint32 = maxIndexValue > 65535;
    const indexArray = useUint32 
      ? new Uint32Array(indices) 
      : new Uint16Array(indices);

    // Update or recreate position attribute
    if (positionAttr && positionAttr.count === vertexCount) {
      // Same count: update in place
      (positionAttr.array as Float32Array).set(positionArray);
      positionAttr.needsUpdate = true;
    } else {
      // Different count: delete old and create new (setAttribute automatically disposes old)
      if (positionAttr) this._geometry.deleteAttribute('position');
      const newAttr = new THREE.Float32BufferAttribute(positionArray, 3);
      this._geometry.setAttribute('position', newAttr);
    }

    // Update or recreate normal attribute
    if (normalAttr && normalAttr.count === vertexCount) {
      (normalAttr.array as Float32Array).set(normalArray);
      normalAttr.needsUpdate = true;
    } else {
      if (normalAttr) this._geometry.deleteAttribute('normal');
      const newAttr = new THREE.Float32BufferAttribute(normalArray, 3);
      this._geometry.setAttribute('normal', newAttr);
    }

    // Update or recreate UV attribute
    if (uvAttr && uvAttr.count === vertexCount) {
      (uvAttr.array as Float32Array).set(uvArray);
      uvAttr.needsUpdate = true;
    } else {
      if (uvAttr) this._geometry.deleteAttribute('uv');
      const newAttr = new THREE.Float32BufferAttribute(uvArray, 2);
      this._geometry.setAttribute('uv', newAttr);
    }

    // UVs are already correct (no rotation needed)
    // UVs are calculated based on actual card dimensions from JSON

    // Update or recreate faceType attribute
    if (faceTypeAttr && faceTypeAttr.count === vertexCount) {
      (faceTypeAttr.array as Float32Array).set(faceTypeArray);
      faceTypeAttr.needsUpdate = true;
    } else {
      if (faceTypeAttr) this._geometry.deleteAttribute('faceType');
      const newAttr = new THREE.Float32BufferAttribute(faceTypeArray, 1);
      this._geometry.setAttribute('faceType', newAttr);
    }

    // Update or recreate plyIndex attribute
    if (plyIndexAttr && plyIndexAttr.count === vertexCount) {
      (plyIndexAttr.array as Float32Array).set(plyIndexArray);
      plyIndexAttr.needsUpdate = true;
    } else {
      if (plyIndexAttr) this._geometry.deleteAttribute('plyIndex');
      const newAttr = new THREE.Float32BufferAttribute(plyIndexArray, 1);
      this._geometry.setAttribute('plyIndex', newAttr);
    }

    // Update or recreate index buffer
    if (existingIndex) {
      const existingIndexCount = existingIndex.count;
      const existingArrayType = existingIndex.array instanceof Uint32Array ? 'uint32' : 'uint16';
      const newArrayType = indexArray instanceof Uint32Array ? 'uint32' : 'uint16';
      
      if (existingIndexCount === indexCount && existingArrayType === newArrayType) {
        (existingIndex.array as Uint16Array | Uint32Array).set(indexArray);
        existingIndex.needsUpdate = true;
      } else {
        // setIndex automatically disposes old index
        this._geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
        const newIndex = this._geometry.getIndex();
        if (newIndex) {
          newIndex.needsUpdate = true;
        }
      }
    } else {
      this._geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
      const newIndex = this._geometry.getIndex();
      if (newIndex) {
        newIndex.needsUpdate = true;
      }
    }

    // Set drawRange to ensure we only draw valid geometry
    this._geometry.setDrawRange(0, indexCount);
    
    // Compute bounding volumes
    this._geometry.computeBoundingBox();
    this._geometry.computeBoundingSphere();
  }

  /**
   * Build a face (front or back) with rounded corners
   * UVs are in 0-1 range, scaled to match card dimensions for artwork accuracy
   * Each face is tagged with its ply index for material selection
   */
  private buildFace(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
    plyIndices: number[],
    indices: number[],
    halfWidth: number,
    halfHeight: number,
    z: number,
    normal: [number, number, number],
    faceType: number,
    plyIndex: number
  ): void {
    const startIndex = positions.length / 3;
    const effectiveWidth = this.width;
    const effectiveHeight = this.height;

    // Generate outline points with rounded corners
    const outlinePoints: Array<{ x: number; y: number; u: number; v: number }> = [];

    // Top-right corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments);
      const x = halfWidth - this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = halfHeight - this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Top-left corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + Math.PI / 2;
      const x = -halfWidth + this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = halfHeight - this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Bottom-left corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + Math.PI;
      const x = -halfWidth + this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = -halfHeight + this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Bottom-right corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + (3 * Math.PI) / 2;
      const x = halfWidth - this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = -halfHeight + this.cornerRadius + this.cornerRadius * Math.sin(angle);
      const u = (x + halfWidth) / effectiveWidth;
      const v = (y + halfHeight) / effectiveHeight;
      outlinePoints.push({ x, y, u, v });
    }

    // Add center vertex
    // Use dimensions as-is (no rotation)
    positions.push(0, 0, z);
    normals.push(...normal);
    uvs.push(0.5, 0.5);
    faceTypes.push(faceType);
    plyIndices.push(plyIndex);

    // Add outline vertices
    // Use dimensions as-is (no rotation) - respect width/height from JSON
    for (const point of outlinePoints) {
      positions.push(point.x, point.y, z);
      normals.push(...normal);
      uvs.push(point.u, point.v);
      faceTypes.push(faceType);
      plyIndices.push(plyIndex);
    }

    // Create triangles from center to outline
    const numOutlineVerts = outlinePoints.length;
    for (let i = 0; i < numOutlineVerts; i++) {
      const next = (i + 1) % numOutlineVerts;
      indices.push(
        startIndex,
        startIndex + 1 + i,
        startIndex + 1 + next
      );
    }
  }

  /**
   * Build side faces (thickness extrusion)
   * Edge faces use UVs (-1, -1) to prevent mask sampling
   * Only builds outer edges of the ply stack
   */
  private buildSideFaces(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
    plyIndices: number[],
    indices: number[],
    halfWidth: number,
    halfHeight: number,
    halfThickness: number
  ): void {
    const startIndex = positions.length / 3;

    // Generate front and back outline points
    const frontOutline: Array<{ x: number; y: number }> = [];
    const backOutline: Array<{ x: number; y: number }> = [];

    // Top-right corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments);
      const x = halfWidth - this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = halfHeight - this.cornerRadius + this.cornerRadius * Math.sin(angle);
      frontOutline.push({ x, y });
      backOutline.push({ x, y });
    }

    // Top-left corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + Math.PI / 2;
      const x = -halfWidth + this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = halfHeight - this.cornerRadius + this.cornerRadius * Math.sin(angle);
      frontOutline.push({ x, y });
      backOutline.push({ x, y });
    }

    // Bottom-left corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + Math.PI;
      const x = -halfWidth + this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = -halfHeight + this.cornerRadius + this.cornerRadius * Math.sin(angle);
      frontOutline.push({ x, y });
      backOutline.push({ x, y });
    }

    // Bottom-right corner
    for (let i = 0; i <= this.cornerSegments; i++) {
      const angle = (Math.PI / 2) * (i / this.cornerSegments) + (3 * Math.PI) / 2;
      const x = halfWidth - this.cornerRadius + this.cornerRadius * Math.cos(angle);
      const y = -halfHeight + this.cornerRadius + this.cornerRadius * Math.sin(angle);
      frontOutline.push({ x, y });
      backOutline.push({ x, y });
    }

    const numPoints = frontOutline.length;
    const perimeter = this.calculatePerimeter();

    // Add vertices for side faces
    for (let i = 0; i < numPoints; i++) {
      const front = frontOutline[i];
      const back = backOutline[i];
      const next = (i + 1) % numPoints;

      // Calculate side normal
      const dx = frontOutline[next].x - frontOutline[i].x;
      const dy = frontOutline[next].y - frontOutline[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = len > 0.0001 ? -dy / len : 0;
      const ny = len > 0.0001 ? dx / len : 0;

      // Calculate UV coordinate along perimeter
      const u = this.calculatePerimeterDistance(frontOutline, i) / perimeter;
      const vFront = 0;
      const vBack = 1;

      // Front edge vertex (edge face - UVs set to -1 to prevent mask sampling)
      // Use dimensions as-is (no rotation)
      // Edge connects outer front (top of stack) to outer back (bottom of stack)
      positions.push(front.x, front.y, halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(-1.0, -1.0); // Out-of-range UVs for edges
      faceTypes.push(2.0); // Edge face type
      plyIndices.push(0); // Edge belongs to outer ply

      // Back edge vertex (edge face - UVs set to -1 to prevent mask sampling)
      // Use dimensions as-is (no rotation)
      positions.push(back.x, back.y, -halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(-1.0, -1.0); // Out-of-range UVs for edges
      faceTypes.push(2.0); // Edge face type
      plyIndices.push(this.plyCount - 1); // Edge belongs to outer ply
    }

    // Create side face quads
    for (let i = 0; i < numPoints; i++) {
      const next = (i + 1) % numPoints;
      
      const iFront = startIndex + i * 2;
      const iBack = startIndex + i * 2 + 1;
      const nextFront = startIndex + next * 2;
      const nextBack = startIndex + next * 2 + 1;

      indices.push(iFront, iBack, nextFront);
      indices.push(iBack, nextBack, nextFront);
    }
  }

  /**
   * Build interior wall faces for die-cut outlines (true geometry cut-through).
   * These are EDGE faces (faceType=2) so the shader can shade them like an edge.
   */
  private buildDiecutSideFaces(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
    plyIndices: number[],
    indices: number[],
    halfThickness: number,
    outlines?: Array<Array<THREE.Vector2>>
  ): void {
    const srcOutlines = outlines ?? this.diecutOutlines;
    if (!srcOutlines || srcOutlines.length === 0) return;

    const EPS = 1e-6;

    const signedArea = (pts: THREE.Vector2[]): number => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
      }
      return 0.5 * a;
    };

    for (const raw of srcOutlines) {
      if (!raw || raw.length < 3) continue;

      // Remove duplicate closing point if present
      const pts = raw.slice();
      const last = pts[pts.length - 1];
      if (pts[0].distanceToSquared(last) < EPS) pts.pop();
      if (pts.length < 3) continue;

      const isCCW = signedArea(pts) > 0;

      const startIndex = positions.length / 3;
      const numPoints = pts.length;

      // Push vertices (2 per point: front/back)
      for (let i = 0; i < numPoints; i++) {
        const p = pts[i];
        const next = pts[(i + 1) % numPoints];

        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (segLen < EPS) continue;

        // Inward normal points toward polygon interior (the cutout region)
        const nx = (isCCW ? -dy : dy) / segLen;
        const ny = (isCCW ? dx : -dx) / segLen;

        // Front vertex (z +)
        positions.push(p.x, p.y, halfThickness);
        normals.push(nx, ny, 0);
        uvs.push(-1.0, -1.0);
        faceTypes.push(2.0);
        plyIndices.push(0);

        // Back vertex (z -)
        positions.push(p.x, p.y, -halfThickness);
        normals.push(nx, ny, 0);
        uvs.push(-1.0, -1.0);
        faceTypes.push(2.0);
        plyIndices.push(this.plyCount - 1);
      }

      // Create side quads (two triangles per edge)
      for (let i = 0; i < numPoints; i++) {
        const next = (i + 1) % numPoints;

        const iFront = startIndex + i * 2;
        const iBack = startIndex + i * 2 + 1;
        const nextFront = startIndex + next * 2;
        const nextBack = startIndex + next * 2 + 1;

        indices.push(iFront, iBack, nextFront);
        indices.push(iBack, nextBack, nextFront);
      }
    }
  }

  /**
   * Calculate total perimeter of the card outline
   */
  private calculatePerimeter(): number {
    const straightSides = 2 * (this.width - 2 * this.cornerRadius) + 2 * (this.height - 2 * this.cornerRadius);
    const cornerArcs = 2 * Math.PI * this.cornerRadius;
    return straightSides + cornerArcs;
  }

  /**
   * Calculate cumulative distance along perimeter up to point index
   */
  private calculatePerimeterDistance(outline: Array<{ x: number; y: number }>, index: number): number {
    let distance = 0;
    for (let i = 0; i < index; i++) {
      const dx = outline[i + 1].x - outline[i].x;
      const dy = outline[i + 1].y - outline[i].y;
      distance += Math.sqrt(dx * dx + dy * dy);
    }
    return distance;
  }

  /**
   * Dispose of geometry resources
   */
  dispose(): void {
    if (this._geometry) {
      this._geometry.dispose();
    }
  }
}

