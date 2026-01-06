/**
 * Print Options Panel
 * 
 * Controls enable/disable for print options and side selection
 */

import { ProoferController } from '../../state/ProoferController.js';
import { CardSide } from '../../state/ProoferState.js';

/**
 * Print Options Panel
 * 
 * Manages print option toggles and side selection
 */
export class PrintOptionsPanel {
  private container: HTMLElement;
  private controller: ProoferController;
  private embossStrengthSlider: HTMLInputElement | null = null;
  private embossStrengthValue: HTMLElement | null = null;
  private embossStrengthDiv: HTMLElement | null = null;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'print-options-panel';
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
    title.textContent = 'Print Options';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    const options = ['foil', 'uv', 'emboss', 'diecut'] as const;

    options.forEach(option => {
      const optionDiv = this.createOptionControl(option);
      this.container.appendChild(optionDiv);
    });

    // Add emboss strength slider (only visible when emboss is enabled)
    this.createEmbossStrengthControl();
  }

  /**
   * Create option control (toggle + side selector)
   */
  private createOptionControl(option: 'foil' | 'uv' | 'emboss' | 'diecut'): HTMLElement {
    const optionDiv = document.createElement('div');
    optionDiv.style.marginBottom = '16px';

    // Toggle
    const toggleDiv = document.createElement('div');
    toggleDiv.style.display = 'flex';
    toggleDiv.style.alignItems = 'center';
    toggleDiv.style.marginBottom = '8px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `option-${option}`;
    checkbox.style.marginRight = '8px';

    const label = document.createElement('label');
    label.htmlFor = `option-${option}`;
    label.textContent = option.charAt(0).toUpperCase() + option.slice(1);
    label.style.fontSize = '14px';
    label.style.cursor = 'pointer';

    toggleDiv.appendChild(checkbox);
    toggleDiv.appendChild(label);
    optionDiv.appendChild(toggleDiv);

    // Side selector (only show when enabled)
    const sideDiv = document.createElement('div');
    sideDiv.style.display = 'none';
    sideDiv.style.marginLeft = '24px';

    const sideLabel = document.createElement('label');
    sideLabel.textContent = 'Side:';
    sideLabel.style.display = 'block';
    sideLabel.style.fontSize = '12px';
    sideLabel.style.marginBottom = '4px';
    sideDiv.appendChild(sideLabel);

    const sideSelect = document.createElement('select');
    sideSelect.style.width = '100%';
    sideSelect.style.padding = '6px';
    const sides: CardSide[] = ['front', 'back'];
    sides.forEach(side => {
      const option = document.createElement('option');
      option.value = side;
      option.textContent = side.charAt(0).toUpperCase() + side.slice(1);
      sideSelect.appendChild(option);
    });
    sideDiv.appendChild(sideSelect);

    optionDiv.appendChild(sideDiv);

    // Event listeners
    checkbox.addEventListener('change', () => {
      const state = this.controller.getState();
      this.controller.updateOptionState(option, {
        enabled: checkbox.checked,
        side: state.optionStates[option].side
      });
      sideDiv.style.display = checkbox.checked ? 'block' : 'none';
      console.log(`[Proofer] ${option} ${checkbox.checked ? 'enabled' : 'disabled'}`);
    });

    sideSelect.addEventListener('change', () => {
      const state = this.controller.getState();
      this.controller.updateOptionState(option, {
        enabled: state.optionStates[option].enabled,
        side: sideSelect.value as CardSide
      });
      console.log(`[Proofer] ${option} side changed to ${sideSelect.value}`);
    });

    return optionDiv;
  }

  /**
   * Create emboss strength slider control
   */
  private createEmbossStrengthControl(): void {
    this.embossStrengthDiv = document.createElement('div');
    this.embossStrengthDiv.style.display = 'none';
    this.embossStrengthDiv.style.marginTop = '16px';
    this.embossStrengthDiv.style.paddingTop = '16px';
    this.embossStrengthDiv.style.borderTop = '1px solid #ddd';

    const label = document.createElement('label');
    label.textContent = 'Emboss Strength';
    label.style.display = 'block';
    label.style.fontSize = '14px';
    label.style.fontWeight = '600';
    label.style.marginBottom = '8px';
    this.embossStrengthDiv.appendChild(label);

    const sliderWrapper = document.createElement('div');
    sliderWrapper.style.display = 'flex';
    sliderWrapper.style.alignItems = 'center';
    sliderWrapper.style.gap = '12px';

    this.embossStrengthSlider = document.createElement('input');
    this.embossStrengthSlider.type = 'range';
    this.embossStrengthSlider.min = '0';
    this.embossStrengthSlider.max = '1';
    this.embossStrengthSlider.step = '0.01';
    this.embossStrengthSlider.value = '0.12';
    this.embossStrengthSlider.style.flex = '1';
    this.embossStrengthSlider.style.cursor = 'pointer';

    this.embossStrengthValue = document.createElement('span');
    this.embossStrengthValue.textContent = '0.12';
    this.embossStrengthValue.style.minWidth = '40px';
    this.embossStrengthValue.style.fontSize = '12px';
    this.embossStrengthValue.style.textAlign = 'right';
    this.embossStrengthValue.style.color = '#666';

    sliderWrapper.appendChild(this.embossStrengthSlider);
    sliderWrapper.appendChild(this.embossStrengthValue);
    this.embossStrengthDiv.appendChild(sliderWrapper);

    // Event listener for slider
    this.embossStrengthSlider.addEventListener('input', () => {
      const value = parseFloat(this.embossStrengthSlider!.value);
      this.controller.updateEmbossStrength(value);
      if (this.embossStrengthValue) {
        this.embossStrengthValue.textContent = value.toFixed(2);
      }
      console.log(`[Proofer] Emboss strength changed to ${value.toFixed(2)}`);
    });

    this.container.appendChild(this.embossStrengthDiv);
  }

  /**
   * Setup state listeners
   */
  private setupListeners(): void {
    this.controller.addListener((state) => {
      // Update checkboxes
      const options = ['foil', 'uv', 'emboss', 'diecut'] as const;
      options.forEach(option => {
        const checkbox = document.getElementById(`option-${option}`) as HTMLInputElement;
        if (checkbox) {
          checkbox.checked = state.optionStates[option].enabled;
        }
      });

      // Update emboss strength slider visibility and value
      if (this.embossStrengthDiv && this.embossStrengthSlider && this.embossStrengthValue) {
        const embossEnabled = state.optionStates.emboss.enabled;
        this.embossStrengthDiv.style.display = embossEnabled ? 'block' : 'none';
        
        if (embossEnabled) {
          this.embossStrengthSlider.value = state.embossStrength.toString();
          this.embossStrengthValue.textContent = state.embossStrength.toFixed(2);
        }
      }
    });
  }
}

