/**
 * File Upload Panel
 * 
 * Handles file upload and parser integration
 */

import { ProoferController } from '../../state/ProoferController.js';
import { ParserStatus, ParserPayload } from '../../state/ProoferState.js';
import { ParserClient } from '../../io/parserClient.js';

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
  private parserClient: ParserClient;
  private pollingAbortController: AbortController | null = null;
  private progressContainer: HTMLElement | null = null;
  private progressCircle: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.parserClient = new ParserClient();
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

    // Load Parser JSON button
    const loadJsonButton = document.createElement('button');
    loadJsonButton.textContent = 'Load Parser JSON';
    loadJsonButton.style.width = '100%';
    loadJsonButton.style.padding = '12px';
    loadJsonButton.style.marginBottom = '12px';
    loadJsonButton.style.backgroundColor = '#28a745';
    loadJsonButton.style.color = 'white';
    loadJsonButton.style.border = 'none';
    loadJsonButton.style.borderRadius = '4px';
    loadJsonButton.style.cursor = 'pointer';
    loadJsonButton.style.fontSize = '14px';
    this.container.appendChild(loadJsonButton);

    // JSON file input (hidden)
    const jsonFileInput = document.createElement('input');
    jsonFileInput.type = 'file';
    jsonFileInput.accept = '.json';
    jsonFileInput.style.display = 'none';
    this.container.appendChild(jsonFileInput);

    // JSON textarea (collapsible)
    const jsonTextareaContainer = document.createElement('div');
    jsonTextareaContainer.style.display = 'none';
    jsonTextareaContainer.style.marginBottom = '12px';
    
    const jsonTextarea = document.createElement('textarea');
    jsonTextarea.placeholder = 'Paste parser JSON here...';
    jsonTextarea.style.width = '100%';
    jsonTextarea.style.height = '150px';
    jsonTextarea.style.padding = '8px';
    jsonTextarea.style.border = '1px solid #ddd';
    jsonTextarea.style.borderRadius = '4px';
    jsonTextarea.style.fontSize = '12px';
    jsonTextarea.style.fontFamily = 'monospace';
    jsonTextareaContainer.appendChild(jsonTextarea);
    
    const pasteButton = document.createElement('button');
    pasteButton.textContent = 'Load from Text';
    pasteButton.style.width = '100%';
    pasteButton.style.padding = '8px';
    pasteButton.style.marginTop = '8px';
    pasteButton.style.backgroundColor = '#17a2b8';
    pasteButton.style.color = 'white';
    pasteButton.style.border = 'none';
    pasteButton.style.borderRadius = '4px';
    pasteButton.style.cursor = 'pointer';
    jsonTextareaContainer.appendChild(pasteButton);
    
    this.container.appendChild(jsonTextareaContainer);

    // Toggle textarea
    loadJsonButton.addEventListener('click', () => {
      const isVisible = jsonTextareaContainer.style.display !== 'none';
      jsonTextareaContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        loadJsonButton.textContent = 'Cancel';
      } else {
        loadJsonButton.textContent = 'Load Parser JSON';
      }
    });

    // File input handler
    jsonFileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.handleJsonFile(file);
      }
    });

    // Paste button handler
    pasteButton.addEventListener('click', async () => {
      const jsonText = jsonTextarea.value.trim();
      if (jsonText) {
        await this.handleJsonText(jsonText);
      }
    });

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

    // Progress bar container (initially hidden)
    this.progressContainer = document.createElement('div');
    this.progressContainer.style.display = 'none';
    this.progressContainer.style.textAlign = 'center';
    this.progressContainer.style.marginBottom = '12px';
    this.progressContainer.style.padding = '16px';
    
    // Circular progress SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '80');
    svg.setAttribute('height', '80');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.style.transform = 'rotate(-90deg)';
    
    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '18');
    bgCircle.setAttribute('cy', '18');
    bgCircle.setAttribute('r', '16');
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', '#e9ecef');
    bgCircle.setAttribute('stroke-width', '3');
    svg.appendChild(bgCircle);
    
    // Progress circle
    this.progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.progressCircle.setAttribute('cx', '18');
    this.progressCircle.setAttribute('cy', '18');
    this.progressCircle.setAttribute('r', '16');
    this.progressCircle.setAttribute('fill', 'none');
    this.progressCircle.setAttribute('stroke', '#007bff');
    this.progressCircle.setAttribute('stroke-width', '3');
    this.progressCircle.setAttribute('stroke-linecap', 'round');
    this.progressCircle.setAttribute('stroke-dasharray', '100.53'); // 2 * PI * 16
    this.progressCircle.setAttribute('stroke-dashoffset', '100.53');
    this.progressCircle.style.transition = 'stroke-dashoffset 0.3s ease';
    svg.appendChild(this.progressCircle);
    
    this.progressContainer.appendChild(svg);
    
    // Progress text
    this.progressText = document.createElement('div');
    this.progressText.style.marginTop = '8px';
    this.progressText.style.fontSize = '14px';
    this.progressText.style.fontWeight = '600';
    this.progressText.style.color = '#007bff';
    this.progressText.textContent = '0%';
    this.progressContainer.appendChild(this.progressText);
    
    this.container.appendChild(this.progressContainer);

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
    
    // Cancel any existing polling
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
    }
    
    // Set uploaded file
    this.controller.setUploadedFile(file);
    
    // Show progress bar and hide status
    this.showProgress(0);
    this.statusElement.style.display = 'none';
    
    try {
      // Upload file to parser service with progress tracking
      const uploadResult = await this.parserClient.uploadFile(
        file,
        (progress) => {
          this.updateProgress(progress);
        }
      );
      
      console.log('[Proofer] File uploaded to parser, jobId:', uploadResult.jobId);
      
      // Hide progress bar and show status
      this.hideProgress();
      this.statusElement.style.display = 'block';
      
      // Set parser status to parsing
      this.controller.setParserStatus('parsing');
      
      // Create new abort controller for polling
      this.pollingAbortController = new AbortController();
      
      // Poll for job status
      await this.parserClient.pollJobStatus(
        uploadResult.jobId,
        (status) => {
          // Update status based on job status
          if (status.status === 'queued' || status.status === 'running') {
            this.controller.setParserStatus('parsing');
          } else if (status.status === 'failed') {
            this.controller.setParserStatus('error', status.error || 'Parser job failed');
          }
        },
        2000, // Poll every 2 seconds
        150,  // Max 5 minutes
        this.pollingAbortController.signal
      );
      
      // Job is done, get final status with payload
      const finalStatus = await this.parserClient.getJobStatus(uploadResult.jobId);
      
      if (finalStatus.status === 'done' && finalStatus.payload) {
        // Load the parser payload
        this.controller.loadParserPayload(finalStatus.payload);
        this.controller.setParserStatus('success');
        console.log('[Proofer] Parser job completed successfully');
      } else {
        throw new Error('Parser job completed but no payload available');
      }
    } catch (error) {
      console.error('[Proofer] Parser error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.controller.setParserStatus('error', errorMessage);
      // Hide progress bar on error
      this.hideProgress();
      this.statusElement.style.display = 'block';
    } finally {
      this.pollingAbortController = null;
    }
  }

  /**
   * Show progress bar
   */
  private showProgress(initialProgress: number = 0): void {
    if (this.progressContainer && this.progressCircle && this.progressText) {
      this.progressContainer.style.display = 'block';
      this.updateProgress(initialProgress);
    }
  }

  /**
   * Hide progress bar
   */
  private hideProgress(): void {
    if (this.progressContainer) {
      this.progressContainer.style.display = 'none';
    }
  }

  /**
   * Update progress bar
   */
  private updateProgress(percent: number): void {
    if (this.progressCircle && this.progressText) {
      const circumference = 2 * Math.PI * 16; // radius = 16
      const offset = circumference - (percent / 100) * circumference;
      this.progressCircle.setAttribute('stroke-dashoffset', offset.toString());
      this.progressText.textContent = `${percent}%`;
      
      // Update color based on progress
      if (percent === 100) {
        this.progressCircle.setAttribute('stroke', '#28a745'); // Green when complete
        this.progressText.style.color = '#28a745';
      } else {
        this.progressCircle.setAttribute('stroke', '#007bff'); // Blue during upload
        this.progressText.style.color = '#007bff';
      }
    }
  }

  /**
   * Handle JSON file upload
   */
  private async handleJsonFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      await this.handleJsonText(text);
    } catch (error) {
      console.error('[Proofer] Failed to load JSON file:', error);
      this.controller.setParserStatus('error', 'Failed to load JSON file');
    }
  }

  /**
   * Handle JSON text
   */
  private async handleJsonText(jsonText: string): Promise<void> {
    try {
      const payload: ParserPayload = JSON.parse(jsonText);
      
      // Validate basic structure
      if (!payload.card || !payload.plates) {
        throw new Error('Invalid parser payload: missing card or plates');
      }
      
      // Load payload
      this.controller.loadParserPayload(payload);
      this.controller.setParserStatus('success');
      
      console.log('[Proofer] Parser JSON loaded successfully');
    } catch (error) {
      console.error('[Proofer] Failed to parse JSON:', error);
      this.controller.setParserStatus('error', error instanceof Error ? error.message : 'Invalid JSON');
    }
  }

  /**
   * Update status display
   */
  private updateStatus(status: ParserStatus, error?: string): void {
    // Don't update status if progress bar is showing (during upload)
    if (this.progressContainer && this.progressContainer.style.display !== 'none') {
      return;
    }
    
    this.statusElement.textContent = '';
    this.statusElement.style.display = 'block';
    
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
        statusText.textContent = 'Status: Processing with Illustrator...';
        this.statusElement.style.backgroundColor = '#fff3cd';
        this.statusElement.style.color = '#856404';
        // Add spinner icon
        const spinner = document.createElement('span');
        spinner.textContent = ' ⏳';
        spinner.style.marginLeft = '4px';
        statusText.appendChild(spinner);
        break;
      case 'success':
        statusText.textContent = 'Status: Success ✓';
        this.statusElement.style.backgroundColor = '#d4edda';
        this.statusElement.style.color = '#155724';
        break;
      case 'warning':
        statusText.textContent = 'Status: Warning ⚠';
        this.statusElement.style.backgroundColor = '#fff3cd';
        this.statusElement.style.color = '#856404';
        break;
      case 'error':
        statusText.textContent = 'Status: Error ✗';
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
      errorText.style.wordBreak = 'break-word';
      this.statusElement.appendChild(errorText);
    }
  }
}

