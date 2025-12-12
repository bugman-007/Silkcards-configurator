import { UIController } from '../ui/UIController.js';

/**
 * Main Application Entry Point
 * Initializes the UI controller which handles all engine setup and UI bindings
 */

async function init() {
  try {
    console.log('Initializing 3D Card Configurator...');
    await UIController.init();
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

