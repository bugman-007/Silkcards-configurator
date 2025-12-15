/**
 * Configurator App Entry Point
 * Initializes the configurator UI controller
 */

import { UIController } from './ui/UIController.js';

async function init() {
  try {
    console.log('Initializing 3D Card Configurator...');
    await UIController.init();
    console.log('Configurator initialized successfully');
  } catch (error) {
    console.error('Failed to initialize configurator:', error);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

