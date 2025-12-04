import * as THREE from 'three';

/**
 * Procedural Card Geometry Generator
 * Creates dynamic card meshes with rounded corners, proper UVs, and thickness
 */
export class CardGeometry {
  private geometry: THREE.BufferGeometry;
  private width: number;
  private height: number;
  private thickness: number;
  private cornerRadius: number;
  private cornerSegments: number;

  constructor(
    width: number = 85,
    height: number = 55,
    thickness: number = 0.3,
    cornerRadius: number = 3,
    cornerSegments: number = 8
  ) {
    this.width = width;
    this.height = height;
    this.thickness = thickness;
    this.cornerRadius = cornerRadius;
    this.cornerSegments = cornerSegments;
    this.geometry = new THREE.BufferGeometry();
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
   * Get the Three.js geometry
   */
  getGeometry(): THREE.BufferGeometry {
    return this.geometry;
  }

  /**
   * Build the complete card geometry with front, back, and sides
   */
  private buildGeometry(): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const halfThickness = this.thickness / 2;

    // Build front face (facing +Z)
    const frontFace = this.buildRoundedRectFace(
      halfWidth,
      halfHeight,
      this.cornerRadius,
      this.cornerSegments,
      halfThickness,
      1 // Z position
    );
    this.addFace(positions, normals, uvs, indices, frontFace, [0, 0, 1], 0);

    // Build back face (facing -Z)
    const backFace = this.buildRoundedRectFace(
      halfWidth,
      halfHeight,
      this.cornerRadius,
      this.cornerSegments,
      -halfThickness,
      -1 // Z position, flipped
    );
    this.addFace(positions, normals, uvs, indices, backFace, [0, 0, -1], 1);

    // Build side faces (edges)
    this.buildSideFaces(
      positions,
      normals,
      uvs,
      indices,
      halfWidth,
      halfHeight,
      this.cornerRadius,
      this.cornerSegments,
      halfThickness
    );

    // Update geometry
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
  }

  /**
   * Build a rounded rectangle face
   * Returns array of {x, y, z, u, v} points
   */
  private buildRoundedRectFace(
    halfWidth: number,
    halfHeight: number,
    cornerRadius: number,
    segments: number,
    z: number,
    flip: number
  ): Array<{ x: number; y: number; z: number; u: number; v: number }> {
    const points: Array<{ x: number; y: number; z: number; u: number; v: number }> = [];
    const effectiveWidth = halfWidth * 2;
    const effectiveHeight = halfHeight * 2;

    // Center point
    points.push({
      x: 0,
      y: 0,
      z: z,
      u: 0.5,
      v: 0.5
    });

    // Build rounded rectangle outline
    const cornerPoints: Array<{ x: number; y: number; u: number; v: number }> = [];

    // Top-right corner
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI / 2) * (i / segments);
      const x = halfWidth - cornerRadius + cornerRadius * Math.cos(angle);
      const y = halfHeight - cornerRadius + cornerRadius * Math.sin(angle);
      cornerPoints.push({
        x: x * flip,
        y: y,
        u: (x + halfWidth) / effectiveWidth,
        v: (y + halfHeight) / effectiveHeight
      });
    }

    // Top-left corner
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI / 2) * (i / segments) + Math.PI / 2;
      const x = -halfWidth + cornerRadius + cornerRadius * Math.cos(angle);
      const y = halfHeight - cornerRadius + cornerRadius * Math.sin(angle);
      cornerPoints.push({
        x: x * flip,
        y: y,
        u: (x + halfWidth) / effectiveWidth,
        v: (y + halfHeight) / effectiveHeight
      });
    }

    // Bottom-left corner
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI / 2) * (i / segments) + Math.PI;
      const x = -halfWidth + cornerRadius + cornerRadius * Math.cos(angle);
      const y = -halfHeight + cornerRadius + cornerRadius * Math.sin(angle);
      cornerPoints.push({
        x: x * flip,
        y: y,
        u: (x + halfWidth) / effectiveWidth,
        v: (y + halfHeight) / effectiveHeight
      });
    }

    // Bottom-right corner
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI / 2) * (i / segments) + (3 * Math.PI) / 2;
      const x = halfWidth - cornerRadius + cornerRadius * Math.cos(angle);
      const y = -halfHeight + cornerRadius + cornerRadius * Math.sin(angle);
      cornerPoints.push({
        x: x * flip,
        y: y,
        u: (x + halfWidth) / effectiveWidth,
        v: (y + halfHeight) / effectiveHeight
      });
    }

    // Convert to 3D points
    return cornerPoints.map(p => ({
      x: p.x,
      y: p.y,
      z: z,
      u: p.u,
      v: p.v
    }));
  }

  /**
   * Add a face to the geometry
   */
  private addFace(
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[],
    facePoints: Array<{ x: number; y: number; z: number; u: number; v: number }>,
    normal: [number, number, number],
    baseIndex: number
  ): void {
    const startIndex = positions.length / 3;

    // Center vertex
    positions.push(0, 0, facePoints[0].z);
    normals.push(...normal);
    uvs.push(0.5, 0.5);

    // Edge vertices
    for (const point of facePoints) {
      positions.push(point.x, point.y, point.z);
      normals.push(...normal);
      uvs.push(point.u, point.v);
    }

    // Create triangles from center to edges
    const numEdgeVerts = facePoints.length;
    for (let i = 0; i < numEdgeVerts; i++) {
      const next = (i + 1) % numEdgeVerts;
      indices.push(
        startIndex,
        startIndex + 1 + i,
        startIndex + 1 + next
      );
    }
  }

  /**
   * Build side faces (edges) of the card
   */
  private buildSideFaces(
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[],
    halfWidth: number,
    halfHeight: number,
    cornerRadius: number,
    segments: number,
    halfThickness: number
  ): void {
    const startIndex = positions.length / 3;

    // Build outline points for front and back
    const frontOutline = this.buildRoundedRectFace(
      halfWidth,
      halfHeight,
      cornerRadius,
      segments,
      halfThickness,
      1
    );
    const backOutline = this.buildRoundedRectFace(
      halfWidth,
      halfHeight,
      cornerRadius,
      segments,
      -halfThickness,
      1
    );

    const numPoints = frontOutline.length;

    // Add front and back edge vertices with correct side normals
    for (let i = 0; i < numPoints; i++) {
      const front = frontOutline[i];
      const back = backOutline[i];
      const next = (i + 1) % numPoints;

      // Calculate side normal (perpendicular to edge, pointing outward)
      const dx = frontOutline[next].x - frontOutline[i].x;
      const dy = frontOutline[next].y - frontOutline[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = len > 0 ? -dy / len : 0;
      const ny = len > 0 ? dx / len : 0;

      // Front edge vertex
      positions.push(front.x, front.y, front.z);
      normals.push(nx, ny, 0);
      uvs.push(i / numPoints, 0);

      // Back edge vertex
      positions.push(back.x, back.y, back.z);
      normals.push(nx, ny, 0);
      uvs.push(i / numPoints, 1);
    }

    // Create side face quads
    for (let i = 0; i < numPoints; i++) {
      const next = (i + 1) % numPoints;
      const base = startIndex + i * 2;

      // Create quad (two triangles)
      indices.push(
        base,
        base + 1,
        base + 2
      );
      indices.push(
        base + 1,
        base + 3,
        base + 2
      );
    }
  }

  /**
   * Dispose of geometry resources
   */
  dispose(): void {
    this.geometry.dispose();
  }
}

