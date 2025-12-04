import * as THREE from 'three';
import { EngineController } from './engine/EngineController.js';
import { CardGeometry } from './engine/CardGeometry.js';
import { MaterialPipeline } from './engine/MaterialPipeline.js';
import { ResourceManager } from './resources/ResourceManager.js';
import { TestHarness } from './test/TestHarness.js';

/**
 * Main Application Entry Point
 * Initializes all components and starts the render loop
 */

// Get canvas element
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element not found');
}

// Initialize components
const engineController = new EngineController(canvas);
const resourceManager = new ResourceManager();

// Default card dimensions (85mm x 55mm credit card)
const defaultWidth = 85;
const defaultHeight = 55;
const defaultThickness = 0.3;
const defaultCornerRadius = 3;

// Initialize application
async function init() {
  try {
    console.log('Initializing 3D Card Configurator Engine...');

    // Create card geometry
    const cardGeometry = new CardGeometry(
      defaultWidth,
      defaultHeight,
      defaultThickness,
      defaultCornerRadius
    );

    // Load resources (with fallbacks if files don't exist)
    let artworkTexture: THREE.Texture;
    let foilMask: THREE.Texture;
    let uvMask: THREE.Texture;
    let embossHeightMap: THREE.Texture;
    let hdrTexture: THREE.DataTexture | null = null;

    try {
      // Try to load HDR environment
      hdrTexture = await resourceManager.loadHDR('/hdr/environment.hdr');
      console.log('HDR environment loaded');
    } catch (error) {
      console.warn('HDR environment not found, using default background');
    }

    try {
      artworkTexture = await resourceManager.loadTexture('/textures/artwork.jpg', 'artwork');
      console.log('Artwork texture loaded');
    } catch (error) {
      console.warn('Artwork texture not found, using placeholder');
      artworkTexture = resourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.8, 0.8, 0.9));
    }

    try {
      foilMask = await resourceManager.loadMask('/masks/foil.png', 'foil');
      console.log('Foil mask loaded');
    } catch (error) {
      console.warn('Foil mask not found, using placeholder');
      foilMask = resourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.0, 0.0, 0.0));
    }

    try {
      uvMask = await resourceManager.loadMask('/masks/uv.png', 'uv');
      console.log('UV mask loaded');
    } catch (error) {
      console.warn('UV mask not found, using placeholder');
      uvMask = resourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.0, 0.0, 0.0));
    }

    try {
      embossHeightMap = await resourceManager.loadMask('/masks/emboss.png', 'emboss');
      console.log('Emboss height map loaded');
    } catch (error) {
      console.warn('Emboss height map not found, using placeholder');
      embossHeightMap = resourceManager.createPlaceholderTexture(512, 512, new THREE.Color(0.5, 0.5, 0.5));
    }

    // Create material pipeline
    const materialPipeline = new MaterialPipeline(
      artworkTexture,
      foilMask,
      uvMask,
      embossHeightMap
    );

    // Initialize engine
    await engineController.init(hdrTexture || undefined);

    // Create mesh
    const cardMesh = new THREE.Mesh(cardGeometry.getGeometry(), materialPipeline.getMaterial());
    engineController.getScene().add(cardMesh);

    // Set up test harness
    const testHarness = new TestHarness(
      cardGeometry,
      materialPipeline,
      engineController
    );

    // Update material uniforms each frame
    const updateLoop = () => {
      const camera = engineController.getCamera();
      materialPipeline.updateCameraPosition(camera);

      // Update light direction (from key light)
      const lightDir = new THREE.Vector3(0.5, 0.5, 0.5).normalize();
      materialPipeline.updateLightDirection(lightDir);
    };

    // Start render loop
    engineController.start();

    // Update material uniforms in sync with render
    const uniformUpdateLoop = () => {
      updateLoop();
      requestAnimationFrame(uniformUpdateLoop);
    };
    uniformUpdateLoop();

    console.log('Engine initialized successfully');
  } catch (error) {
    console.error('Failed to initialize engine:', error);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

