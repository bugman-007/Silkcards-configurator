/**
 * Parsed Layers Panel
 * 
 * Displays plates extracted by parser
 */

import { ProoferController } from '../../state/ProoferController.js';
import { ParsedPlate } from '../../state/ProoferState.js';

/**
 * Parsed Layers Panel
 * 
 * Shows parsed plates with thumbnails and selection
 */
export class ParsedLayersPanel {
  private container: HTMLElement;
  private controller: ProoferController;
  private platesContainer: HTMLElement;
  private selectedPlateId: string | null = null;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'parsed-layers-panel';
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
    title.textContent = 'Parsed Plates';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    // Plates container
    this.platesContainer = document.createElement('div');
    this.platesContainer.className = 'plates-container';
    this.platesContainer.style.display = 'flex';
    this.platesContainer.style.flexDirection = 'column';
    this.platesContainer.style.gap = '8px';
    this.container.appendChild(this.platesContainer);
  }

  /**
   * Setup state listeners
   */
  private setupListeners(): void {
    this.controller.addListener((state) => {
      this.renderPlates(state.parsedPlates);
    });
  }

  /**
   * Render plates
   */
  private renderPlates(plates: ParsedPlate[]): void {
    this.platesContainer.innerHTML = '';

    if (plates.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No plates parsed yet';
      emptyMessage.style.color = '#6c757d';
      emptyMessage.style.fontSize = '14px';
      emptyMessage.style.fontStyle = 'italic';
      this.platesContainer.appendChild(emptyMessage);
      return;
    }

    plates.forEach(plate => {
      const plateElement = this.createPlateElement(plate);
      this.platesContainer.appendChild(plateElement);
    });
  }

  /**
   * Create plate element
   */
  private createPlateElement(plate: ParsedPlate): HTMLElement {
    const plateDiv = document.createElement('div');
    plateDiv.className = 'plate-item';
    plateDiv.dataset.plateId = plate.id;
    plateDiv.style.padding = '12px';
    plateDiv.style.border = '1px solid #ddd';
    plateDiv.style.borderRadius = '4px';
    plateDiv.style.cursor = 'pointer';
    plateDiv.style.backgroundColor = this.selectedPlateId === plate.id ? '#e7f3ff' : 'white';
    
    // Thumbnail (placeholder)
    const thumbnail = document.createElement('div');
    thumbnail.style.width = '100%';
    thumbnail.style.height = '80px';
    thumbnail.style.backgroundColor = '#e9ecef';
    thumbnail.style.borderRadius = '4px';
    thumbnail.style.marginBottom = '8px';
    thumbnail.style.display = 'flex';
    thumbnail.style.alignItems = 'center';
    thumbnail.style.justifyContent = 'center';
    thumbnail.textContent = plate.thumbnail ? '' : 'No thumbnail';
    if (plate.thumbnail) {
      const img = document.createElement('img');
      img.src = plate.thumbnail;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      thumbnail.appendChild(img);
    }
    plateDiv.appendChild(thumbnail);

    // Filename
    const filename = document.createElement('div');
    filename.textContent = plate.filename;
    filename.style.fontSize = '12px';
    filename.style.fontWeight = '600';
    filename.style.marginBottom = '4px';
    plateDiv.appendChild(filename);

    // Type and side
    const meta = document.createElement('div');
    meta.textContent = `${plate.type} (${plate.side})`;
    meta.style.fontSize = '11px';
    meta.style.color = '#6c757d';
    plateDiv.appendChild(meta);

    // Click handler
    plateDiv.addEventListener('click', () => {
      this.selectedPlateId = plate.id;
      this.renderPlates(this.controller.getState().parsedPlates);
      console.log('[Proofer] Plate selected:', plate.id);
    });

    return plateDiv;
  }
}

