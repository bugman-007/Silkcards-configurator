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
  
  // Retry mechanism for checking materials when they become available
  private materialCheckTimeout: NodeJS.Timeout | null = null;

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

    // Initialize EngineController
    this.engineController = new EngineController('#proofer-canvas');

    // Initialize ResourceManager
    await ResourceManager.init();

    // Get initial state
    const state = this.prooferController.getState();

    // Create card geometry (supports multi-ply)
    this.cardGeometry = new CardGeometry({
      width: state.width,
      height: state.height,
      thickness: state.thickness,
      cornerRadius: state.cornerRadius,
      plyCount: state.plyCount || 1
    });

    // Initialize engine bridge (manages materials per ply/face)
    this.engineBridge = new EngineBridge(this.prooferController, this.cardGeometry);
    
    // Register callback to update meshes when materials are ready
    this.engineBridge.setOnMaterialsReadyCallback(() => {
      console.log('[ProoferUI] Materials ready callback triggered, updating meshes');
      const currentState = this.prooferController.getState();
      this.updateMeshes(currentState);
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
    // Create placeholder meshes for ply 0 (default single-ply)
    const plyIndex = 0;
    
    // Front mesh
    const frontKey = `ply${plyIndex}_front`;
    if (!this.plyMeshes.has(frontKey)) {
      const frontMaterial = this.createPlaceholderMaterial(true);
      const frontGeometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'front');
      const frontMesh = new THREE.Mesh(frontGeometry, frontMaterial);
      this.plyMeshes.set(frontKey, frontMesh);
      this.engineController.add(frontMesh);
      this.engineController.registerMaterialForLighting(frontMaterial);
    }

    // Back mesh
    const backKey = `ply${plyIndex}_back`;
    if (!this.plyMeshes.has(backKey)) {
      const backMaterial = this.createPlaceholderMaterial(false);
      const backGeometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'back');
      const backMesh = new THREE.Mesh(backGeometry, backMaterial);
      this.plyMeshes.set(backKey, backMesh);
      this.engineController.add(backMesh);
      this.engineController.registerMaterialForLighting(backMaterial);
    }

    console.log('[ProoferUI] Created placeholder meshes for initial display');
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
    this.cardGeometry.updateDimensions(
      state.width,
      state.height,
      state.thickness,
      state.cornerRadius,
      state.plyCount || 1
    );
    
    // Update geometries for existing meshes (don't remove them - just update)
    // This avoids flickering and ensures meshes stay visible
    for (const [key, mesh] of this.plyMeshes) {
      const match = key.match(/ply(\d+)_(front|back)/);
      if (match) {
        const plyIndex = parseInt(match[1], 10);
        const face = match[2] as 'front' | 'back';
        const newGeometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, face);
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        mesh.geometry = newGeometry;
      }
    }
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

    // For each ply in FaceStacks, create/update front and back meshes
    for (const [plyIndex, plyStack] of state.faceStacks) {
      // Front mesh
      const frontKey = `ply${plyIndex}_front`;
      let frontMesh = this.plyMeshes.get(frontKey);
      const frontMaterial = this.engineBridge.getMaterial(plyIndex, 'front');
      
      if (frontMaterial) {
        if (!frontMesh) {
          // Create geometry for this specific ply/face
          const geometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'front');
          // Create new front mesh
          frontMesh = new THREE.Mesh(geometry, frontMaterial);
          this.plyMeshes.set(frontKey, frontMesh);
          this.engineController.add(frontMesh);
          // Register material for lighting updates
          this.engineController.registerMaterialForLighting(frontMaterial);
          console.log(`[ProoferUI] Created front mesh for ply ${plyIndex} with material`, {
            hasPrint: !!frontMaterial.uniforms.uPrintMap?.value,
            printTexture: frontMaterial.uniforms.uPrintMap?.value?.uuid
          });
        } else {
          // Always update mesh material to ensure it's using the latest material
          // (materials may have been updated with new textures)
          const oldMaterial = frontMesh.material;
          if (oldMaterial !== frontMaterial) {
            // Unregister old material
            if (oldMaterial instanceof THREE.ShaderMaterial) {
              this.engineController.unregisterMaterialForLighting(oldMaterial);
            }
            frontMesh.material = frontMaterial;
            // Register new material
            this.engineController.registerMaterialForLighting(frontMaterial);
            console.log(`[ProoferUI] Updated front mesh material for ply ${plyIndex}`, {
              hasPrint: !!frontMaterial.uniforms.uPrintMap?.value,
              printTexture: frontMaterial.uniforms.uPrintMap?.value?.uuid
            });
          } else {
            // Same material reference, but textures might have been updated
            // Force material update to ensure textures are refreshed
            frontMaterial.needsUpdate = true;
          }
          // Update geometry in case dimensions changed
          const newGeometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'front');
          if (frontMesh.geometry !== newGeometry) {
            if (frontMesh.geometry) {
              frontMesh.geometry.dispose();
            }
            frontMesh.geometry = newGeometry;
          }
        }
      } else {
        // Material not available yet
        allMaterialsReady = false;
        if (!frontMesh) {
          // Create placeholder mesh if it doesn't exist
          const placeholderMaterial = this.createPlaceholderMaterial(true);
          const geometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'front');
          frontMesh = new THREE.Mesh(geometry, placeholderMaterial);
          this.plyMeshes.set(frontKey, frontMesh);
          this.engineController.add(frontMesh);
          this.engineController.registerMaterialForLighting(placeholderMaterial);
          console.log(`[ProoferUI] Created placeholder front mesh for ply ${plyIndex} (waiting for materials)`);
          needsRetry = true;
        }
      }

      // Back mesh
      const backKey = `ply${plyIndex}_back`;
      let backMesh = this.plyMeshes.get(backKey);
      const backMaterial = this.engineBridge.getMaterial(plyIndex, 'back');
      
      if (backMaterial) {
        if (!backMesh) {
          // Create geometry for this specific ply/face
          const geometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'back');
          // Create new back mesh
          backMesh = new THREE.Mesh(geometry, backMaterial);
          this.plyMeshes.set(backKey, backMesh);
          this.engineController.add(backMesh);
          // Register material for lighting updates
          this.engineController.registerMaterialForLighting(backMaterial);
          console.log(`[ProoferUI] Created back mesh for ply ${plyIndex} with material`, {
            hasPrint: !!backMaterial.uniforms.uPrintMap?.value,
            printTexture: backMaterial.uniforms.uPrintMap?.value?.uuid
          });
        } else {
          // Always update mesh material to ensure it's using the latest material
          // (materials may have been updated with new textures)
          const oldMaterial = backMesh.material;
          if (oldMaterial !== backMaterial) {
            // Unregister old material
            if (oldMaterial instanceof THREE.ShaderMaterial) {
              this.engineController.unregisterMaterialForLighting(oldMaterial);
            }
            backMesh.material = backMaterial;
            // Register new material
            this.engineController.registerMaterialForLighting(backMaterial);
            console.log(`[ProoferUI] Updated back mesh material for ply ${plyIndex}`, {
              hasPrint: !!backMaterial.uniforms.uPrintMap?.value,
              printTexture: backMaterial.uniforms.uPrintMap?.value?.uuid
            });
          } else {
            // Same material reference, but textures might have been updated
            // Force material update to ensure textures are refreshed
            backMaterial.needsUpdate = true;
          }
          // Update geometry in case dimensions changed
          const newGeometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'back');
          if (backMesh.geometry !== newGeometry) {
            if (backMesh.geometry) {
              backMesh.geometry.dispose();
            }
            backMesh.geometry = newGeometry;
          }
        }
      } else {
        // Material not available yet
        allMaterialsReady = false;
        if (!backMesh) {
          // Create placeholder mesh if it doesn't exist
          const placeholderMaterial = this.createPlaceholderMaterial(false);
          const geometry = this.cardGeometry.createPlyFaceGeometry(plyIndex, 'back');
          backMesh = new THREE.Mesh(geometry, placeholderMaterial);
          this.plyMeshes.set(backKey, backMesh);
          this.engineController.add(backMesh);
          this.engineController.registerMaterialForLighting(placeholderMaterial);
          console.log(`[ProoferUI] Created placeholder back mesh for ply ${plyIndex} (waiting for materials)`);
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
      validKeys.add(`ply${plyIndex}_front`);
      validKeys.add(`ply${plyIndex}_back`);
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
      this.engineController.remove(mesh);
      // Unregister material from lighting updates
      if (mesh.material instanceof THREE.ShaderMaterial) {
        this.engineController.unregisterMaterialForLighting(mesh.material);
      }
      // Dispose geometry
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      // Dispose material
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      this.plyMeshes.delete(key);
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
