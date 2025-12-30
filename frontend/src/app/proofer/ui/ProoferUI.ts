/**
 * Proofer UI Controller
 * 
 * Manages viewport initialization and rendering from ProoferState
 * Supports multi-ply architecture with separate meshes per ply/face
 */

import * as THREE from 'three';
import { EngineController } from '../engine/EngineController.js';
import { CardGeometry } from '../geometry/CardGeometry.js';
import { MaterialPipeline } from '../materials/MaterialPipeline.js';
import { ResourceManager } from '../resources/ResourceManager.js';
import { ProoferController } from '../state/ProoferController.js';
import { EngineBridge } from '../bridge/EngineBridge.js';

/**
 * Proofer UI Controller
 * 
 * Manages viewport and rendering - supports multi-ply with separate meshes
 */
export class ProoferUI {
  private engineController: EngineController;
  private cardGeometry: CardGeometry;
  private prooferController: ProoferController;
  private engineBridge: EngineBridge;
  private canvasContainer: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  
  // Meshes per ply/face: key = "ply{index}_{face}"
  private plyMeshes: Map<string, THREE.Mesh> = new Map();
  
  // Store original Z positions for mesh-transform-based dev spacing
  private originalMeshPositions: Map<string, number> = new Map();
  
  // Retry mechanism for checking materials when they become available
  private materialCheckTimeout: NodeJS.Timeout | null = null;
  
  // Dev mode: increased layer spacing for easier inspection
  private devModeEnabled: boolean = false;
  private devModeButton: HTMLButtonElement | null = null;
  private devLayerSpacingAmount: number = 25.0; // 2.5cm = 25mm in world units

  /**
   * Initialize the proofer UI
   */
  static async init(canvasContainer: HTMLElement, controller: ProoferController): Promise<ProoferUI> {
    const ui = new ProoferUI();
    await ui.initialize(canvasContainer, controller);
    return ui;
  }

  private constructor() {
    // Private constructor
  }

  /**
   * Initialize engine, resources, geometry, and materials
   */
  private async initialize(canvasContainer: HTMLElement, controller: ProoferController): Promise<void> {
    this.canvasContainer = canvasContainer;
    this.prooferController = controller;

    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'proofer-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.canvasContainer.appendChild(canvas);
    
    // Create dev mode toggle button (top-left corner)
    this.createDevModeButton();

    // Initialize EngineController
    this.engineController = new EngineController('#proofer-canvas');

    // Initialize ResourceManager
    await ResourceManager.init();

    // Get initial state
    const state = this.prooferController.getState();

    // Create card geometry (supports multi-ply)
    // Note: Dev mode spacing is handled in vertex shader, not geometry
    this.cardGeometry = new CardGeometry({
      width: state.width,
      height: state.height,
      thickness: state.thickness,
      cornerRadius: state.cornerRadius,
      plyCount: state.plyCount || 1,
      spacingMultiplier: 1.0 // Always normal spacing - dev mode uses shader
    });

    // Initialize engine bridge (manages materials per ply/face)
    this.engineBridge = new EngineBridge(this.prooferController, this.cardGeometry);
    
    // Register callback to update meshes when materials are ready
    this.engineBridge.setOnMaterialsReadyCallback(() => {
      console.log('[ProoferUI] Materials ready callback triggered, updating meshes');
      const currentState = this.prooferController.getState();
      this.updateMeshes(currentState);
      // Apply dev mode spacing to newly created meshes if dev mode is enabled
      this.applyDevLayerSpacing();
    });

    // Start render loop
    this.engineController.start();

    // Create initial placeholder mesh (so card is visible even without FaceStacks)
    this.createPlaceholderMesh(state);

    // Listen to state changes for geometry and mesh updates
    this.prooferController.addListener((state) => {
      this.updateGeometry(state);
      this.updateMeshes(state);
    });

    // Watch for container size changes (when panels are resized)
    this.setupResizeObserver();

    console.log('[Proofer] Viewport initialized');
  }

  /**
   * Create a placeholder material
   */
  private createPlaceholderMaterial(isFront: boolean): THREE.ShaderMaterial {
    const whitePrint = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(1.0, 1.0, 1.0));
    const blackMask = ResourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0, 0, 0), THREE.NoColorSpace);
    blackMask.generateMipmaps = false;
    blackMask.minFilter = THREE.LinearFilter;
    blackMask.magFilter = THREE.LinearFilter;

    return MaterialPipeline.createCardMaterial({
      isFront,
      printMap: whitePrint,
      foilMask: blackMask,
      uvMask: blackMask,
      embossMask: blackMask,
      diecutMask: blackMask
    });
  }

  /**
   * Create a placeholder mesh when no FaceStacks are available
   * This ensures the card is always visible, even before parser payload is loaded
   */
  private createPlaceholderMesh(state: any): void {
    // Create placeholder mesh for ply 0 (default single-ply)
    const plyIndex = 0;
    const plyKey = `ply${plyIndex}`;
    
    if (!this.plyMeshes.has(plyKey)) {
      const placeholderFront = this.createPlaceholderMaterial(true);
      const placeholderBack = this.createPlaceholderMaterial(false);
      const edgeMat = MaterialPipeline.createEdgeStandardMaterial();

      // Get diecut outlines once (they may be empty)
      const diecutOutlines = this.cardGeometry.getDiecutOutlines();

      // Build ALL plies as extruded geometry so edges are always real + lit.
      // If diecutOutlines exist and diecut is enabled, extrusion includes holes.
      const diecutEnabled = state.optionStates?.diecut?.enabled === true;
      const outlinesForGeom = diecutEnabled ? diecutOutlines : [];

      const { geometry, centerZ } = this.cardGeometry.createPlyExtrudedGeometryFromDiecut(
        plyIndex,
        outlinesForGeom
      );

      // ExtrudeGeometry group material order: [sides, top(+z)=front, bottom(-z)=back]
      const placeholderMaterials = [edgeMat, placeholderFront, placeholderBack];

      const plyMesh = new THREE.Mesh(geometry, placeholderMaterials);
      plyMesh.position.z = centerZ;
      this.originalMeshPositions.set(plyKey, centerZ);
      this.plyMeshes.set(plyKey, plyMesh);
      this.engineController.add(plyMesh);
      this.engineController.registerMaterialForLighting(placeholderFront);
      this.engineController.registerMaterialForLighting(placeholderBack);
      console.log('[ProoferUI] Created placeholder ply mesh for initial display');
    }
  }

  /**
   * Setup ResizeObserver to watch canvas container size changes
   * This ensures the renderer updates when panels are resized
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce resize to avoid excessive calls
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        if (this.engineController) {
          this.engineController.resize();
        }
      }, 100);
    });

    this.resizeObserver.observe(this.canvasContainer);
  }

  private resizeTimeout: NodeJS.Timeout | null = null;

  /**
   * Update geometry from state
   */
  private updateGeometry(state: any): void {
    // Note: Dev mode spacing is now handled in vertex shader, not geometry
    const plyCount = state.plyCount || 1;
    
    this.cardGeometry.updateDimensions(
      state.width,
      state.height,
      state.thickness,
      state.cornerRadius,
      plyCount,
      1.0 // Always use normal spacing - dev mode uses shader offset
    );
    
    // Get diecut outlines once (they may be empty)
    const diecutOutlines = this.cardGeometry.getDiecutOutlines();
    const diecutEnabled = state.optionStates?.diecut?.enabled === true;
    const outlinesForGeom = diecutEnabled ? diecutOutlines : [];

    // Update geometries for existing ply meshes (don't remove them - just update)
    // This avoids flickering and ensures meshes stay visible
    for (const [key, mesh] of this.plyMeshes) {
      const match = key.match(/ply(\d+)/);
      if (match) {
        const plyIndex = parseInt(match[1], 10);
        // Always use extruded geometry for real edges
        const { geometry: newGeometry, centerZ } = this.cardGeometry.createPlyExtrudedGeometryFromDiecut(
          plyIndex,
          outlinesForGeom
        );
        if (mesh.geometry !== newGeometry) {
          if (mesh.geometry) {
            mesh.geometry.dispose();
          }
          mesh.geometry = newGeometry;
          mesh.position.z = centerZ;
          // Update original position
          this.originalMeshPositions.set(key, centerZ);
        }
      }
    }
    // Re-apply dev spacing after geometry update
    this.applyDevLayerSpacing();
  }

  /**
   * Update meshes based on FaceStacks
   * Creates/updates meshes per ply/face as materials become available
   */
  private updateMeshes(state: any): void {
    if (!state.faceStacks || state.faceStacks.size === 0) {
      // No FaceStacks - keep placeholder meshes if they exist, or create them
      if (this.plyMeshes.size === 0) {
        this.createPlaceholderMesh(state);
      }
      // Clear any pending material checks
      if (this.materialCheckTimeout) {
        clearTimeout(this.materialCheckTimeout);
        this.materialCheckTimeout = null;
      }
      return;
    }

    let allMaterialsReady = true;
    let needsRetry = false;

    // For each ply in FaceStacks, create/update ply mesh (box or extrude)
    for (const [plyIndex, plyStack] of state.faceStacks) {
      // One mesh per ply (not separate front/back)
      const plyKey = `ply${plyIndex}`;
      let plyMesh = this.plyMeshes.get(plyKey);
      const frontMaterial = this.engineBridge.getMaterial(plyIndex, 'front');
      const backMaterial = this.engineBridge.getMaterial(plyIndex, 'back');
      
      const diecutEnabled = state.optionStates?.diecut?.enabled === true;
      const useDiecutGeometry = diecutEnabled && plyIndex === 0 && this.cardGeometry.usesDiecutGeometry();

      const sideMaterial = MaterialPipeline.createEdgeMaterial(new THREE.Color(1.0, 1.0, 1.0));

      const plyMaterials = useDiecutGeometry
        ? this.engineBridge.getPlyExtrudeMaterials(plyIndex, sideMaterial)
        : this.engineBridge.getPlyBoxMaterials(plyIndex, sideMaterial);

      if (plyMaterials && frontMaterial && backMaterial) {
        const { geometry, centerZ } = useDiecutGeometry
          ? this.cardGeometry.createPlyExtrudedGeometryFromDiecut(plyIndex, this.cardGeometry.getDiecutOutlines())
          : this.cardGeometry.createPlyBoxGeometry(plyIndex);

        if (!plyMesh) {
          plyMesh = new THREE.Mesh(geometry, plyMaterials);
          plyMesh.position.z = centerZ;
          this.originalMeshPositions.set(plyKey, centerZ);
          this.plyMeshes.set(plyKey, plyMesh);
          this.engineController.add(plyMesh);
        } else {
          plyMesh.material = plyMaterials;
          plyMesh.geometry.dispose();
          plyMesh.geometry = geometry;
          plyMesh.position.z = centerZ;
          this.originalMeshPositions.set(plyKey, centerZ);
        }

        this.engineController.registerMaterialForLighting(frontMaterial);
        this.engineController.registerMaterialForLighting(backMaterial);
        console.log(`[ProoferUI] Updated ply mesh for ply ${plyIndex}`, {
          hasFrontPrint: !!frontMaterial.uniforms.uPrintMap?.value,
          hasBackPrint: !!backMaterial.uniforms.uPrintMap?.value,
          useDiecutGeometry
        });
      } else {
        // Materials not ready yet
        allMaterialsReady = false;
        if (!plyMesh) {
          // Create placeholder ply mesh
          const placeholderFront = this.createPlaceholderMaterial(true);
          const placeholderBack = this.createPlaceholderMaterial(false);
          const edgeMat = MaterialPipeline.createEdgeStandardMaterial();

          // Get diecut outlines once (they may be empty)
          const diecutOutlines = this.cardGeometry.getDiecutOutlines();

          // Build ALL plies as extruded geometry so edges are always real + lit.
          // If diecutOutlines exist and diecut is enabled, extrusion includes holes.
          const diecutEnabled = state.optionStates?.diecut?.enabled === true;
          const outlinesForGeom = diecutEnabled ? diecutOutlines : [];

          const { geometry, centerZ } = this.cardGeometry.createPlyExtrudedGeometryFromDiecut(
            plyIndex,
            outlinesForGeom
          );

          // ExtrudeGeometry group material order: [sides, top(+z)=front, bottom(-z)=back]
          const placeholderMaterials = [edgeMat, placeholderFront, placeholderBack];

          plyMesh = new THREE.Mesh(geometry, placeholderMaterials);
          plyMesh.position.z = centerZ;
          this.originalMeshPositions.set(plyKey, centerZ);
          this.plyMeshes.set(plyKey, plyMesh);
          this.engineController.add(plyMesh);
          this.engineController.registerMaterialForLighting(placeholderFront);
          this.engineController.registerMaterialForLighting(placeholderBack);
          console.log(`[ProoferUI] Created placeholder ply mesh for ply ${plyIndex} (waiting for materials)`);
          needsRetry = true;
        }
      }
    }

    // If materials aren't ready yet, schedule a retry
    if (needsRetry && !allMaterialsReady) {
      // Clear any existing timeout
      if (this.materialCheckTimeout) {
        clearTimeout(this.materialCheckTimeout);
      }
      // Retry after a short delay (materials are being created asynchronously)
      this.materialCheckTimeout = setTimeout(() => {
        const currentState = this.prooferController.getState();
        this.updateMeshes(currentState);
      }, 100); // Check again after 100ms
      console.log('[ProoferUI] Materials not ready yet, will retry in 100ms');
    } else if (allMaterialsReady && this.materialCheckTimeout) {
      // All materials ready, clear retry timeout
      clearTimeout(this.materialCheckTimeout);
      this.materialCheckTimeout = null;
    }

    // Remove meshes for plies that no longer exist
    const validKeys = new Set<string>();
    for (const [plyIndex] of state.faceStacks) {
      validKeys.add(`ply${plyIndex}`); // One box mesh per ply
    }
    
    for (const key of this.plyMeshes.keys()) {
      if (!validKeys.has(key)) {
        this.removeMesh(key);
      }
    }

    // Update lighting for all materials
    this.updateLightingForAllMaterials();
  }

  /**
   * Remove a specific mesh
   */
  private removeMesh(key: string): void {
    const mesh = this.plyMeshes.get(key);
    if (mesh) {
      // Remove from scene
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      // Unregister material(s) from lighting updates (handle arrays for boxes)
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) {
          if (mat instanceof THREE.ShaderMaterial) {
            this.engineController.unregisterMaterialForLighting(mat);
          }
        }
      } else if (mesh.material instanceof THREE.ShaderMaterial) {
        this.engineController.unregisterMaterialForLighting(mesh.material);
      }
      // Dispose geometry
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      // Dispose material(s) - handle both single material and material arrays (for boxes)
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) {
          if (mat instanceof THREE.Material) {
            mat.dispose();
          }
        }
      } else if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      this.plyMeshes.delete(key);
      // Clean up stored original position
      this.originalMeshPositions.delete(key);
      console.log(`[ProoferUI] Removed mesh: ${key}`);
    }
  }

  /**
   * Remove all meshes
   */
  private removeAllMeshes(): void {
    for (const key of this.plyMeshes.keys()) {
      this.removeMesh(key);
    }
  }

  /**
   * Create dev mode toggle button (top-left corner)
   */
  private createDevModeButton(): void {
    this.devModeButton = document.createElement('button');
    this.devModeButton.textContent = 'Dev: Layer Spacing';
    this.devModeButton.style.position = 'absolute';
    this.devModeButton.style.top = '10px';
    this.devModeButton.style.left = '10px';
    this.devModeButton.style.zIndex = '1000';
    this.devModeButton.style.padding = '8px 12px';
    this.devModeButton.style.backgroundColor = '#2a2a2a';
    this.devModeButton.style.color = '#ffffff';
    this.devModeButton.style.border = '1px solid #555';
    this.devModeButton.style.borderRadius = '4px';
    this.devModeButton.style.cursor = 'pointer';
    this.devModeButton.style.fontSize = '12px';
    this.devModeButton.style.fontFamily = 'monospace';
    this.devModeButton.title = 'Toggle dev mode: 2.5cm spacing between layers';
    
    this.devModeButton.addEventListener('click', () => {
      this.toggleDevMode();
    });
    
    this.canvasContainer.appendChild(this.devModeButton);
    this.updateDevModeButtonStyle();
  }
  
  /**
   * Apply dev mode spacing to meshes using mesh transforms (not shader)
   * This offsets PLY CENTERS, not individual front/back faces.
   * Each ply moves as a unit (front + back together), creating gaps between plies.
   */
  private applyDevLayerSpacing(): void {
    console.log(`DEV_LAYER_SPACING_ACTIVE_777: Applying spacing, enabled=${this.devModeEnabled}, meshCount=${this.plyMeshes.size}`);
    
    // Get ply count from current state
    const state = this.prooferController.getState();
    const plyCount = state.plyCount || 1;
    
    let updatedCount = 0;
    
    for (const [key, mesh] of this.plyMeshes) {
      // Extract ply index from key: "ply0", "ply1", etc. (box mesh format)
      const match = key.match(/ply(\d+)/);
      if (!match) continue;
      
      const plyIndex = parseInt(match[1], 10);
      
      // Store original position if not already stored
      if (!this.originalMeshPositions.has(key)) {
        this.originalMeshPositions.set(key, 0);
      }
      
      const originalZ = this.originalMeshPositions.get(key) ?? 0;
      
      // Calculate ply center offset:
      // Reverse order: ply 0 is in front (+Z), higher indices are behind (-Z)
      // Use spacing amount directly (this.devLayerSpacingAmount = 25mm = 2.5cm)
      // This matches the geometry calculation which uses PLY_THICKNESS_MM * spacingMultiplier
      let spacingOffset = 0.0;
      if (this.devModeEnabled && plyCount > 0) {
        const totalStackHeight = this.devLayerSpacingAmount * plyCount;
        const totalHalfStackHeight = totalStackHeight / 2;
        spacingOffset = totalHalfStackHeight - (plyIndex + 0.5) * this.devLayerSpacingAmount;
      }
      
      mesh.position.z = originalZ + spacingOffset;
      mesh.updateMatrixWorld(true);
      updatedCount++;
      
      // Debug: log each mesh
      console.log(`DEV_LAYER_SPACING_ACTIVE_777: ${key} plyIndex=${plyIndex} plyCount=${plyCount} originalZ=${originalZ.toFixed(2)} offset=${spacingOffset.toFixed(2)} finalZ=${mesh.position.z.toFixed(2)}`);
    }
    
    console.log(`DEV_LAYER_SPACING_ACTIVE_777: Updated ${updatedCount} meshes for ${plyCount} plies, spacing=${this.devModeEnabled ? this.devLayerSpacingAmount : 0}mm`);
  }

  /**
   * Toggle dev mode (increased layer spacing via mesh transforms)
   */
  private toggleDevMode(): void {
    this.devModeEnabled = !this.devModeEnabled;
    this.updateDevModeButtonStyle();
    
    // Apply mesh-transform-based spacing (moves meshes along Z-axis)
    this.applyDevLayerSpacing();
    
    console.log(`[ProoferUI] Dev mode ${this.devModeEnabled ? 'enabled' : 'disabled'} - layer spacing: ${this.devModeEnabled ? '2.5cm' : 'normal'}`);
  }
  
  /**
   * Update dev mode button style based on state
   */
  private updateDevModeButtonStyle(): void {
    if (!this.devModeButton) return;
    
    if (this.devModeEnabled) {
      this.devModeButton.style.backgroundColor = '#4a7c59';
      this.devModeButton.style.borderColor = '#6ba87b';
      this.devModeButton.textContent = 'Dev: 2.5cm ON';
    } else {
      this.devModeButton.style.backgroundColor = '#2a2a2a';
      this.devModeButton.style.borderColor = '#555';
      this.devModeButton.textContent = 'Dev: Layer Spacing';
    }
  }

  /**
   * Update lighting for all materials
   */
  private updateLightingForAllMaterials(): void {
    const materials = this.engineBridge.getAllMaterials();
    const camera = this.engineController.getCamera();
    for (const material of materials) {
      // Get lighting info from EngineController if available
      // For now, use default lighting
      MaterialPipeline.updateLighting(material, {
        direction: new THREE.Vector3(0, 0, 1),
        color: new THREE.Color(1.0, 1.0, 1.0),
        ambient: new THREE.Color(0.3, 0.3, 0.3),
        cameraPosition: camera?.position
      });
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    if (this.materialCheckTimeout) {
      clearTimeout(this.materialCheckTimeout);
      this.materialCheckTimeout = null;
    }

    // Remove all meshes
    this.removeAllMeshes();

    if (this.engineController) {
      this.engineController.dispose();
    }
    if (this.cardGeometry) {
      this.cardGeometry.dispose();
    }
    if (this.engineBridge) {
      this.engineBridge.dispose();
    }
  }
}
