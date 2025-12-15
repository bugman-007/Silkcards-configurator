/**
 * Proofer App Entry Point
 * Initializes the proofer layout and viewport
 */

import { ProoferLayout } from './ui/ProoferLayout.js';
import { ProoferUI } from './ui/ProoferUI.js';
import { ProoferController } from './state/ProoferController.js';

async function init() {
  try {
    console.log('Initializing 3D Proofer...');

    // Clear existing content and create proofer container
    document.body.innerHTML = '';
    const appContainer = document.createElement('div');
    appContainer.id = 'app';
    document.body.appendChild(appContainer);

    // Create proofer controller
    const controller = new ProoferController();

    // Create layout (3-panel structure)
    const layout = new ProoferLayout('app', controller);

    // Initialize viewport in center panel
    const centerPanel = layout.getCenterPanel();
    await ProoferUI.init(centerPanel, controller);

    console.log('Proofer initialized successfully');
  } catch (error) {
    console.error('Failed to initialize proofer:', error);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
