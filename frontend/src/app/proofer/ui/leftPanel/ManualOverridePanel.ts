/**
 * Manual Override Panel
 * 
 * Allows manual upload of PNG files to replace parsed plates
 */

import { ProoferController } from '../../state/ProoferController.js';
import { ParsedPlate, LayerType, CardSide } from '../../state/ProoferState.js';

/**
 * Manual Override Panel
 * 
 * Handles manual file uploads and plate replacement
 */
export class ManualOverridePanel {
  private container: HTMLElement;
  private controller: ProoferController;
  private fileInput: HTMLInputElement;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'manual-override-panel';
    this.container.style.padding = '16px';
    parent.appendChild(this.container);

    this.createUI();
    this.setupEventListeners();
  }

  /**
   * Create UI elements
   */
  private createUI(): void {
    const title = document.createElement('h3');
    title.textContent = 'Manual Override';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    const description = document.createElement('p');
    description.textContent = 'Upload PNG to replace parsed plate';
    description.style.fontSize = '12px';
    description.style.color = '#6c757d';
    description.style.margin = '0 0 12px 0';
    this.container.appendChild(description);

    // File input (hidden)
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.png,.jpg,.jpeg';
    this.fileInput.style.display = 'none';
    this.container.appendChild(this.fileInput);

    // Upload button
    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Upload PNG';
    uploadButton.style.width = '100%';
    uploadButton.style.padding = '12px';
    uploadButton.style.backgroundColor = '#28a745';
    uploadButton.style.color = 'white';
    uploadButton.style.border = 'none';
    uploadButton.style.borderRadius = '4px';
    uploadButton.style.cursor = 'pointer';
    this.container.appendChild(uploadButton);

    uploadButton.addEventListener('click', () => {
      this.fileInput.click();
    });

    // Type selection
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Layer Type:';
    typeLabel.style.display = 'block';
    typeLabel.style.marginTop = '12px';
    typeLabel.style.marginBottom = '4px';
    typeLabel.style.fontSize = '12px';
    this.container.appendChild(typeLabel);

    const typeSelect = document.createElement('select');
    typeSelect.style.width = '100%';
    typeSelect.style.padding = '8px';
    typeSelect.style.marginBottom = '12px';
    const types: LayerType[] = ['artwork', 'foil', 'uv', 'emboss', 'diecut'];
    types.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      typeSelect.appendChild(option);
    });
    this.container.appendChild(typeSelect);

    // Side selection
    const sideLabel = document.createElement('label');
    sideLabel.textContent = 'Side:';
    sideLabel.style.display = 'block';
    sideLabel.style.marginBottom = '4px';
    sideLabel.style.fontSize = '12px';
    this.container.appendChild(sideLabel);

    const sideSelect = document.createElement('select');
    sideSelect.style.width = '100%';
    sideSelect.style.padding = '8px';
    sideSelect.style.marginBottom = '12px';
    const sides: CardSide[] = ['front', 'back'];
    sides.forEach(side => {
      const option = document.createElement('option');
      option.value = side;
      option.textContent = side.charAt(0).toUpperCase() + side.slice(1);
      sideSelect.appendChild(option);
    });
    this.container.appendChild(sideSelect);

    // Store references for file handler
    this.fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.handleFileUpload(
          file,
          typeSelect.value as LayerType,
          sideSelect.value as CardSide
        );
      }
    });
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Handled in createUI
  }

  /**
   * Handle file upload
   */
  private async handleFileUpload(file: File, type: LayerType, side: CardSide): Promise<void> {
    console.log('[Proofer] Manual override upload:', file.name, type, side);
    
    // Create thumbnail URL from file (for image display)
    const thumbnailUrl = URL.createObjectURL(file);
    
    // Create parsed plate from manual upload
    const plate: ParsedPlate = {
      id: `manual-${Date.now()}`,
      type,
      side,
      filename: file.name,
      thumbnail: thumbnailUrl, // Object URL for thumbnail display
      file // File object for actual use
    };
    
    // Add to parsed plates
    this.controller.addParsedPlate(plate);
    
    console.log('[Proofer] Manual plate added:', plate.id);
  }
}

