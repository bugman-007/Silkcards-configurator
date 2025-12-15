/**
 * Artwork Transform Panel
 * 
 * Controls position, scale, and rotation of artwork
 */

import { ProoferController } from '../../state/ProoferController.js';

/**
 * Artwork Transform Panel
 * 
 * Manages artwork transformation controls
 */
export class ArtworkTransformPanel {
  private container: HTMLElement;
  private controller: ProoferController;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'artwork-transform-panel';
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
    title.textContent = 'Artwork Transform';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    // Position X
    this.createSlider('Position X', 'positionX', -100, 100, 0);
    
    // Position Y
    this.createSlider('Position Y', 'positionY', -100, 100, 0);
    
    // Scale
    this.createSlider('Scale', 'scale', 0.5, 2.0, 1.0, 0.01);
    
    // Rotation
    this.createSlider('Rotation', 'rotation', -180, 180, 0);
  }

  /**
   * Create slider control
   */
  private createSlider(
    label: string,
    property: 'positionX' | 'positionY' | 'scale' | 'rotation',
    min: number,
    max: number,
    defaultValue: number,
    step: number = 1
  ): void {
    const sliderDiv = document.createElement('div');
    sliderDiv.style.marginBottom = '16px';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.display = 'block';
    labelEl.style.fontSize = '12px';
    labelEl.style.marginBottom = '4px';
    sliderDiv.appendChild(labelEl);

    const inputDiv = document.createElement('div');
    inputDiv.style.display = 'flex';
    inputDiv.style.gap = '8px';
    inputDiv.style.alignItems = 'center';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `transform-${property}`;
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.value = defaultValue.toString();
    slider.style.flex = '1';
    inputDiv.appendChild(slider);

    const valueDisplay = document.createElement('span');
    valueDisplay.id = `transform-${property}-value`;
    valueDisplay.textContent = defaultValue.toString();
    valueDisplay.style.minWidth = '50px';
    valueDisplay.style.fontSize = '12px';
    valueDisplay.style.textAlign = 'right';
    inputDiv.appendChild(valueDisplay);

    sliderDiv.appendChild(inputDiv);
    this.container.appendChild(sliderDiv);

    // Event listener
    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueDisplay.textContent = value.toFixed(property === 'scale' ? 2 : 0);
      
      const state = this.controller.getState();
      this.controller.updateArtworkTransform({
        [property]: value
      });
      
      console.log(`[Proofer] Artwork ${property} changed to ${value}`);
    });
  }

  /**
   * Setup state listeners
   */
  private setupListeners(): void {
    this.controller.addListener((state) => {
      const transform = state.artworkTransform;
      
      // Update sliders
      const positionXSlider = document.getElementById('transform-positionX') as HTMLInputElement;
      const positionYSlider = document.getElementById('transform-positionY') as HTMLInputElement;
      const scaleSlider = document.getElementById('transform-scale') as HTMLInputElement;
      const rotationSlider = document.getElementById('transform-rotation') as HTMLInputElement;

      if (positionXSlider) {
        positionXSlider.value = transform.positionX.toString();
        const valueDisplay = document.getElementById('transform-positionX-value');
        if (valueDisplay) valueDisplay.textContent = transform.positionX.toString();
      }
      if (positionYSlider) {
        positionYSlider.value = transform.positionY.toString();
        const valueDisplay = document.getElementById('transform-positionY-value');
        if (valueDisplay) valueDisplay.textContent = transform.positionY.toString();
      }
      if (scaleSlider) {
        scaleSlider.value = transform.scale.toString();
        const valueDisplay = document.getElementById('transform-scale-value');
        if (valueDisplay) valueDisplay.textContent = transform.scale.toFixed(2);
      }
      if (rotationSlider) {
        rotationSlider.value = transform.rotation.toString();
        const valueDisplay = document.getElementById('transform-rotation-value');
        if (valueDisplay) valueDisplay.textContent = transform.rotation.toString();
      }
    });
  }
}

