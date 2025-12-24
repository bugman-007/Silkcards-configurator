import * as THREE from 'three';

/**
 * Procedural Card Geometry Generator - Proofer
 * Creates dynamic card meshes with rounded corners, proper UVs, and thickness
 * 
 * UVs are always in 0-1 range and scale with card size to match artwork scaling
 */
export class CardGeometry {
  private _geometry: THREE.BufferGeometry;
  private width: number;
  private height: number;
  private thickness: number;
  private cornerRadius: number;
  private cornerSegments: number = 8;

  /**
   * Constructor with options object
   * Uses dimensions as-is from the JSON (no hardcoded rotation)
   */
  constructor(options: {
    width: number;
    height: number;
    thickness: number;
    cornerRadius: number;
  }) {
    this.width = options.width;
    this.height = options.height;
    this.thickness = options.thickness;
    this.cornerRadius = options.cornerRadius;
    this._geometry = new THREE.BufferGeometry();
    this.buildGeometry();
  }

  /**
   * Update card dimensions and rebuild geometry
   */
  updateDimensions(width: number, height: number, thickness: number, cornerRadius: number): void {
    this.width = width;
    this.height = height;
    this.thickness = thickness;
    this.cornerRadius = cornerRadius;
    this.rebuildGeometry();
  }

  /**
   * Get the Three.js geometry (getter property)
   */
  get geometry(): THREE.BufferGeometry {
    return this._geometry;
  }

  /**
   * Build the complete card geometry with front, back, and sides
   * Called only during initial construction
   */
  private buildGeometry(): void {
    this._geometry = new THREE.BufferGeometry();
    this.rebuildGeometry();
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
    const indices: number[] = [];

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const halfThickness = this.thickness / 2;

    // Build front face (facing +Z) - faceType = 0
    this.buildFace(
      positions,
      normals,
      uvs,
      faceTypes,
      indices,
      halfWidth,
      halfHeight,
      halfThickness,
      [0, 0, 1], // Normal pointing +Z
      0.0 // Front face
    );

    // Build back face (facing -Z) - faceType = 1
    this.buildFace(
      positions,
      normals,
      uvs,
      faceTypes,
      indices,
      halfWidth,
      halfHeight,
      -halfThickness,
      [0, 0, -1], // Normal pointing -Z
      1.0 // Back face
    );

    // Build side faces (thickness extrusion) - faceType = 2
    this.buildSideFaces(
      positions,
      normals,
      uvs,
      faceTypes,
      indices,
      halfWidth,
      halfHeight,
      halfThickness
    );

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
    const existingIndex = this._geometry.getIndex();

    // Create typed arrays
    const positionArray = new Float32Array(positions);
    const normalArray = new Float32Array(normals);
    const uvArray = new Float32Array(uvs);
    const faceTypeArray = new Float32Array(faceTypes);

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
   */
  private buildFace(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
    indices: number[],
    halfWidth: number,
    halfHeight: number,
    z: number,
    normal: [number, number, number],
    faceType: number
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

    // Add outline vertices
    // Use dimensions as-is (no rotation) - respect width/height from JSON
    for (const point of outlinePoints) {
      positions.push(point.x, point.y, z);
      normals.push(...normal);
      uvs.push(point.u, point.v);
      faceTypes.push(faceType);
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
   */
  private buildSideFaces(
    positions: number[],
    normals: number[],
    uvs: number[],
    faceTypes: number[],
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
      positions.push(front.x, front.y, halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(-1.0, -1.0); // Out-of-range UVs for edges
      faceTypes.push(2.0); // Edge face type

      // Back edge vertex (edge face - UVs set to -1 to prevent mask sampling)
      // Use dimensions as-is (no rotation)
      positions.push(back.x, back.y, -halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(-1.0, -1.0); // Out-of-range UVs for edges
      faceTypes.push(2.0); // Edge face type
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

