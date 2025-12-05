import { TestHarness } from './test/TestHarness.js';

/**
 * Main Application Entry Point
 * Initializes the test harness which handles all engine setup
 */

// Initialize application when DOM is ready
async function init() {
  try {
    console.log('Initializing 3D Card Configurator Engine...');
    
    // TestHarness handles all initialization:
    // - EngineController
    // - ResourceManager
    // - CardGeometry
    // - MaterialPipeline
    // - Mesh creation and scene setup
    // - Render loop
    // - Development controls
    await TestHarness.init();

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
