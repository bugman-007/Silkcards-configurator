/**
 * File Upload Panel
 * 
 * Handles file upload and parser integration
 */

import { ProoferController } from '../../state/ProoferController.js';
import { ParserStatus } from '../../state/ProoferState.js';

/**
 * File Upload Panel
 * 
 * Manages file upload UI and parser status
 */
export class FileUploadPanel {
  private container: HTMLElement;
  private controller: ProoferController;
  private fileInput: HTMLInputElement;
  private statusElement: HTMLElement;
  private uploadButton: HTMLButtonElement;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'file-upload-panel';
    this.container.style.padding = '16px';
    this.container.style.borderBottom = '1px solid #ddd';
    parent.appendChild(this.container);

    this.createUI();
    this.setupEventListeners();
  }

  /**
   * Create UI elements
   */
  private createUI(): void {
    const title = document.createElement('h3');
    title.textContent = 'File Upload';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    // File input (hidden)
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.ai,.pdf';
    this.fileInput.style.display = 'none';
    this.container.appendChild(this.fileInput);

    // Upload button
    this.uploadButton = document.createElement('button');
    this.uploadButton.textContent = 'Upload .ai or .pdf';
    this.uploadButton.style.width = '100%';
    this.uploadButton.style.padding = '12px';
    this.uploadButton.style.marginBottom = '12px';
    this.uploadButton.style.backgroundColor = '#007bff';
    this.uploadButton.style.color = 'white';
    this.uploadButton.style.border = 'none';
    this.uploadButton.style.borderRadius = '4px';
    this.uploadButton.style.cursor = 'pointer';
    this.container.appendChild(this.uploadButton);

    // Status display
    this.statusElement = document.createElement('div');
    this.statusElement.className = 'parser-status';
    this.statusElement.style.padding = '8px';
    this.statusElement.style.borderRadius = '4px';
    this.statusElement.style.fontSize = '14px';
    this.updateStatus('idle');
    this.container.appendChild(this.statusElement);

    // Listen to state changes
    this.controller.addListener((state) => {
      this.updateStatus(state.parserStatus, state.parserError);
      if (state.uploadedFile) {
        this.uploadButton.textContent = `File: ${state.uploadedFile.name}`;
      }
    });
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.uploadButton.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.handleFileUpload(file);
      }
    });
  }

  /**
   * Handle file upload
   */
  private async handleFileUpload(file: File): Promise<void> {
    console.log('[Proofer] File uploaded:', file.name);
    
    // Set uploaded file
    this.controller.setUploadedFile(file);
    
    // Set parser status to parsing
    this.controller.setParserStatus('parsing');
    
    // TODO: Call parserClient here
    // For now, simulate parsing
    setTimeout(() => {
      // Simulate success
      this.controller.setParserStatus('success');
      
      // Simulate parsed plates (placeholder)
      // In real implementation, this would come from parserClient
      console.log('[Proofer] Parser would extract plates here');
    }, 2000);
  }

  /**
   * Update status display
   */
  private updateStatus(status: ParserStatus, error?: string): void {
    this.statusElement.textContent = '';
    
    const statusText = document.createElement('div');
    statusText.style.fontWeight = '600';
    statusText.style.marginBottom = '4px';
    
    switch (status) {
      case 'idle':
        statusText.textContent = 'Status: Idle';
        this.statusElement.style.backgroundColor = '#e9ecef';
        this.statusElement.style.color = '#495057';
        break;
      case 'parsing':
        statusText.textContent = 'Status: Parsing...';
        this.statusElement.style.backgroundColor = '#fff3cd';
        this.statusElement.style.color = '#856404';
        break;
      case 'success':
        statusText.textContent = 'Status: Success';
        this.statusElement.style.backgroundColor = '#d4edda';
        this.statusElement.style.color = '#155724';
        break;
      case 'warning':
        statusText.textContent = 'Status: Warning';
        this.statusElement.style.backgroundColor = '#fff3cd';
        this.statusElement.style.color = '#856404';
        break;
      case 'error':
        statusText.textContent = 'Status: Error';
        this.statusElement.style.backgroundColor = '#f8d7da';
        this.statusElement.style.color = '#721c24';
        break;
    }
    
    this.statusElement.appendChild(statusText);
    
    if (error) {
      const errorText = document.createElement('div');
      errorText.textContent = error;
      errorText.style.fontSize = '12px';
      errorText.style.marginTop = '4px';
      this.statusElement.appendChild(errorText);
    }
  }
}

