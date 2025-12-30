/**
 * Edge Finish Panel
 * 
 * Controls edge finish (color/foil) for card edges
 */

import { ProoferController } from '../../state/ProoferController.js';
import * as THREE from 'three';

/**
 * Edge Finish Panel
 * 
 * Manages edge finish toggles and color/foil selection
 */
export class EdgeFinishPanel {
  private container: HTMLElement;
  private controller: ProoferController;
  private checkbox: HTMLInputElement;
  private modeSelect: HTMLSelectElement;
  private colorInput: HTMLInputElement;
  private colorLabel: HTMLElement;
  private foilLabel: HTMLElement;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'edge-finish-panel';
    this.container.style.padding = '16px';
    this.container.style.borderBottom = '1px solid #ddd';
    parent.appendChild(this.container);

    this.createUI();
    this.setupListeners();
  }

  /**
   * Create UI elements
   */
  private createUI(): void {
    const title = document.createElement('h3');
    title.textContent = 'Edge Finish';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    // Toggle: "Add color/foil to edge"
    const toggleDiv = document.createElement('div');
    toggleDiv.style.display = 'flex';
    toggleDiv.style.alignItems = 'center';
    toggleDiv.style.marginBottom = '12px';

    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    this.checkbox.id = 'edge-finish-enabled';
    this.checkbox.style.marginRight = '8px';

    const label = document.createElement('label');
    label.htmlFor = 'edge-finish-enabled';
    label.textContent = 'Add color/foil to edge';
    label.style.fontSize = '14px';
    label.style.cursor = 'pointer';

    toggleDiv.appendChild(this.checkbox);
    toggleDiv.appendChild(label);
    this.container.appendChild(toggleDiv);

    // Mode selector (only show when enabled)
    const modeDiv = document.createElement('div');
    modeDiv.style.display = 'none';
    modeDiv.style.marginLeft = '24px';
    modeDiv.style.marginBottom = '12px';

    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Mode:';
    modeLabel.style.display = 'block';
    modeLabel.style.fontSize = '12px';
    modeLabel.style.marginBottom = '4px';
    modeDiv.appendChild(modeLabel);

    this.modeSelect = document.createElement('select');
    this.modeSelect.style.width = '100%';
    this.modeSelect.style.padding = '6px';

    const colorOption = document.createElement('option');
    colorOption.value = 'color';
    colorOption.textContent = 'Color';
    this.modeSelect.appendChild(colorOption);

    const foilOption = document.createElement('option');
    foilOption.value = 'foil';
    foilOption.textContent = 'Cold Foil';
    this.modeSelect.appendChild(foilOption);

    modeDiv.appendChild(this.modeSelect);
    this.container.appendChild(modeDiv);

    // Color picker (only show when mode is 'color' and enabled)
    const colorDiv = document.createElement('div');
    colorDiv.style.display = 'none';
    colorDiv.style.marginLeft = '24px';
    colorDiv.style.marginBottom = '8px';

    this.colorLabel = document.createElement('label');
    this.colorLabel.textContent = 'Color:';
    this.colorLabel.style.display = 'block';
    this.colorLabel.style.fontSize = '12px';
    this.colorLabel.style.marginBottom = '4px';
    colorDiv.appendChild(this.colorLabel);

    const colorInputWrapper = document.createElement('div');
    colorInputWrapper.style.display = 'flex';
    colorInputWrapper.style.alignItems = 'center';
    colorInputWrapper.style.gap = '8px';

    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.id = 'edge-finish-color';
    this.colorInput.value = '#ffffff';
    this.colorInput.style.width = '60px';
    this.colorInput.style.height = '32px';
    this.colorInput.style.border = '1px solid #ccc';
    this.colorInput.style.borderRadius = '4px';
    this.colorInput.style.cursor = 'pointer';

    colorInputWrapper.appendChild(this.colorInput);
    colorDiv.appendChild(colorInputWrapper);
    this.container.appendChild(colorDiv);

    // Foil info label (only show when mode is 'foil')
    this.foilLabel = document.createElement('div');
    this.foilLabel.textContent = 'Cold Foil (28pt only)';
    this.foilLabel.style.display = 'none';
    this.foilLabel.style.marginLeft = '24px';
    this.foilLabel.style.fontSize = '11px';
    this.foilLabel.style.color = '#666';
    this.foilLabel.style.fontStyle = 'italic';
    this.container.appendChild(this.foilLabel);

    // Event listeners
    this.checkbox.addEventListener('change', () => {
      const state = this.controller.getState();
      this.controller.updateEdgeFinish({
        enabled: this.checkbox.checked,
        mode: state.edgeFinish.mode,
        color: state.edgeFinish.color
      });
      this.updateUI();
      console.log(`[Proofer] Edge finish ${this.checkbox.checked ? 'enabled' : 'disabled'}`);
    });

    this.modeSelect.addEventListener('change', () => {
      const state = this.controller.getState();
      const newMode = this.modeSelect.value as 'color' | 'foil';
      
      // Check if foil is available (28pt only)
      const thicknessPt = this.getThicknessInPoints();
      if (newMode === 'foil' && thicknessPt !== 28) {
        // Force back to color if not 28pt
        this.modeSelect.value = 'color';
        alert('Cold Foil is only available for 28pt cards. Please select Color mode.');
        return;
      }
      
      this.controller.updateEdgeFinish({
        enabled: state.edgeFinish.enabled,
        mode: newMode,
        color: state.edgeFinish.color
      });
      this.updateUI();
      console.log(`[Proofer] Edge finish mode changed to ${newMode}`);
    });

    this.colorInput.addEventListener('change', () => {
      const state = this.controller.getState();
      this.controller.updateEdgeFinish({
        enabled: state.edgeFinish.enabled,
        mode: state.edgeFinish.mode,
        color: this.colorInput.value
      });
      console.log(`[Proofer] Edge finish color changed to ${this.colorInput.value}`);
    });
  }

  /**
   * Get thickness in points (helper to match controller logic)
   */
  private getThicknessInPoints(): number {
    const state = this.controller.getState();
    const thicknessMm = state.thickness;
    
    // Known thicknesses in mm (approximate):
    const thickness28ptMm = 0.98777; // Approximate 28pt in mm
    const tolerance = 0.1; // 0.1mm tolerance
    
    if (Math.abs(thicknessMm - thickness28ptMm) < tolerance) {
      return 28;
    }
    
    const thickness16ptMm = 0.56444;
    if (Math.abs(thicknessMm - thickness16ptMm) < tolerance) {
      return 16;
    }
    
    const thickness32ptMm = 1.12888;
    if (Math.abs(thicknessMm - thickness32ptMm) < tolerance) {
      return 32;
    }
    
    const thickness45ptMm = 1.5875;
    if (Math.abs(thicknessMm - thickness45ptMm) < tolerance) {
      return 45;
    }
    
    const thickness48ptMm = 1.69332;
    if (Math.abs(thicknessMm - thickness48ptMm) < tolerance) {
      return 48;
    }
    
    return 0;
  }

  /**
   * Update UI based on state
   */
  private updateUI(): void {
    const state = this.controller.getState();
    const thicknessPt = this.getThicknessInPoints();
    const is28pt = thicknessPt === 28;

    // Update checkbox
    this.checkbox.checked = state.edgeFinish.enabled;

    // Show/hide mode selector
    const modeDiv = this.modeSelect.parentElement as HTMLElement;
    modeDiv.style.display = state.edgeFinish.enabled ? 'block' : 'none';

    // Update mode selector
    this.modeSelect.value = state.edgeFinish.mode;

    // Disable foil option if not 28pt
    const foilOption = this.modeSelect.querySelector('option[value="foil"]') as HTMLOptionElement;
    if (foilOption) {
      foilOption.disabled = !is28pt;
      if (!is28pt && state.edgeFinish.mode === 'foil') {
        // Force to color if foil was selected but not available
        this.controller.updateEdgeFinish({ mode: 'color' });
        this.modeSelect.value = 'color';
      }
    }

    // Show/hide color picker
    const colorDiv = this.colorInput.parentElement?.parentElement as HTMLElement;
    if (colorDiv) {
      colorDiv.style.display = (state.edgeFinish.enabled && state.edgeFinish.mode === 'color') ? 'block' : 'none';
    }

    // Show/hide foil label
    this.foilLabel.style.display = (state.edgeFinish.enabled && state.edgeFinish.mode === 'foil') ? 'block' : 'none';

    // Update color input
    this.colorInput.value = state.edgeFinish.color;
  }

  /**
   * Setup state listeners
   */
  private setupListeners(): void {
    this.controller.addListener((state) => {
      this.updateUI();
    });
  }
}

