import * as THREE from 'three';

/**
 * Procedural Card Geometry Generator
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
    this.buildGeometry();
  }

  /**
   * Get the Three.js geometry (getter property)
   */
  get geometry(): THREE.BufferGeometry {
    return this._geometry;
  }

  /**
   * Build the complete card geometry with front, back, and sides
   */
  private buildGeometry(): void {
    // Dispose old geometry if it exists
    if (this._geometry) {
      this._geometry.dispose();
    }
    this._geometry = new THREE.BufferGeometry();

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const halfThickness = this.thickness / 2;

    // Build front face (facing +Z)
    this.buildFace(
      positions,
      normals,
      uvs,
      indices,
      halfWidth,
      halfHeight,
      halfThickness,
      [0, 0, 1] // Normal pointing +Z
    );

    // Build back face (facing -Z)
    this.buildFace(
      positions,
      normals,
      uvs,
      indices,
      halfWidth,
      halfHeight,
      -halfThickness,
      [0, 0, -1] // Normal pointing -Z
    );

    // Build side faces (thickness extrusion)
    this.buildSideFaces(
      positions,
      normals,
      uvs,
      indices,
      halfWidth,
      halfHeight,
      halfThickness
    );

    // Set geometry attributes
    this._geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this._geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    this._geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this._geometry.setIndex(indices);
    
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
    indices: number[],
    halfWidth: number,
    halfHeight: number,
    z: number,
    normal: [number, number, number]
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
      
      // UV mapping: 0-1 range, scaled to card dimensions
      // This ensures artwork always maps correctly regardless of card size
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
    uvs.push(0.5, 0.5); // Center UV

    // Add outline vertices
    for (const point of outlinePoints) {
      positions.push(point.x, point.y, z);
      normals.push(...normal);
      uvs.push(point.u, point.v);
    }

    // Create triangles from center to outline (fan triangulation)
    const numOutlineVerts = outlinePoints.length;
    for (let i = 0; i < numOutlineVerts; i++) {
      const next = (i + 1) % numOutlineVerts;
      indices.push(
        startIndex, // Center vertex
        startIndex + 1 + i, // Current outline vertex
        startIndex + 1 + next // Next outline vertex
      );
    }
  }

  /**
   * Build side faces (thickness extrusion)
   */
  private buildSideFaces(
    positions: number[],
    normals: number[],
    uvs: number[],
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
    const perimeter = this.calculatePerimeter(halfWidth, halfHeight);

    // Add vertices for side faces
    for (let i = 0; i < numPoints; i++) {
      const front = frontOutline[i];
      const back = backOutline[i];
      const next = (i + 1) % numPoints;

      // Calculate side normal (perpendicular to edge, pointing outward)
      const dx = frontOutline[next].x - frontOutline[i].x;
      const dy = frontOutline[next].y - frontOutline[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = len > 0.0001 ? -dy / len : 0;
      const ny = len > 0.0001 ? dx / len : 0;

      // Calculate UV coordinate along perimeter
      const u = this.calculatePerimeterDistance(frontOutline, i) / perimeter;
      const vFront = 0;
      const vBack = 1;

      // Front edge vertex
      positions.push(front.x, front.y, halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(u, vFront);

      // Back edge vertex
      positions.push(back.x, back.y, -halfThickness);
      normals.push(nx, ny, 0);
      uvs.push(u, vBack);
    }

    // Create side face quads (two triangles per quad)
    for (let i = 0; i < numPoints; i++) {
      const next = (i + 1) % numPoints;
      const base = startIndex + i * 2;

      // Quad as two triangles
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  /**
   * Calculate total perimeter of the card outline
   */
  private calculatePerimeter(halfWidth: number, halfHeight: number): number {
    const straightSides = 2 * (this.width - 2 * this.cornerRadius) + 2 * (this.height - 2 * this.cornerRadius);
    const cornerArcs = 2 * Math.PI * this.cornerRadius; // Full circle for all 4 corners
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
