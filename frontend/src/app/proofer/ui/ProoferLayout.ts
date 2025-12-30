/**
 * Proofer Layout Component
 * 
 * 3-panel layout for the Proofer application
 */

import { FileUploadPanel } from './leftPanel/FileUploadPanel.js';
import { ParsedLayersPanel } from './leftPanel/ParsedLayersPanel.js';
import { ManualOverridePanel } from './leftPanel/ManualOverridePanel.js';
import { PrintOptionsPanel } from './rightPanel/PrintOptionsPanel.js';
import { EdgeFinishPanel } from './rightPanel/EdgeFinishPanel.js';
import { LayerAssignmentPanel } from './rightPanel/LayerAssignmentPanel.js';
import { ArtworkTransformPanel } from './rightPanel/ArtworkTransformPanel.js';
import { ApprovalPanel } from './rightPanel/ApprovalPanel.js';
import { ProoferController } from '../state/ProoferController.js';

/**
 * Proofer Layout
 * 
 * Manages the 3-panel layout structure
 */
export class ProoferLayout {
  private container: HTMLElement;
  private leftPanel: HTMLElement;
  private centerPanel: HTMLElement;
  private rightPanel: HTMLElement;
  private controller: ProoferController;

  // Resize handles
  private leftResizer: HTMLElement;
  private rightResizer: HTMLElement;
  private isResizing: boolean = false;
  private currentResizer: HTMLElement | null = null;

  // Panel components
  private fileUploadPanel: FileUploadPanel;
  private parsedLayersPanel: ParsedLayersPanel;
  private manualOverridePanel: ManualOverridePanel;
  private printOptionsPanel: PrintOptionsPanel;
  private edgeFinishPanel: EdgeFinishPanel;
  private layerAssignmentPanel: LayerAssignmentPanel;
  private artworkTransformPanel: ArtworkTransformPanel;
  private approvalPanel: ApprovalPanel;

  constructor(containerId: string, controller: ProoferController) {
    this.controller = controller;
    this.container = document.getElementById(containerId) || document.body;
    this.createLayout();
    this.initializePanels();
  }

  /**
   * Create the 3-panel layout structure
   */
  private createLayout(): void {
    // Create container with flexbox for resizable panels
    this.container.style.display = 'flex';
    this.container.style.height = '100vh';
    this.container.style.width = '100vw';
    this.container.style.overflow = 'hidden';

    // Left Panel
    this.leftPanel = document.createElement('div');
    this.leftPanel.id = 'proofer-left-panel';
    this.leftPanel.style.display = 'flex';
    this.leftPanel.style.flexDirection = 'column';
    this.leftPanel.style.width = '300px';
    this.leftPanel.style.minWidth = '200px';
    this.leftPanel.style.maxWidth = '600px';
    this.leftPanel.style.overflowY = 'auto';
    this.leftPanel.style.backgroundColor = '#f5f5f5';
    this.leftPanel.style.position = 'relative';
    this.container.appendChild(this.leftPanel);

    // Left Resizer (between left and center)
    this.leftResizer = this.createResizer('vertical');
    this.leftResizer.style.cursor = 'col-resize';
    this.container.appendChild(this.leftResizer);

    // Center Panel (Viewport)
    this.centerPanel = document.createElement('div');
    this.centerPanel.id = 'proofer-center-panel';
    this.centerPanel.style.position = 'relative';
    this.centerPanel.style.flex = '1';
    this.centerPanel.style.minWidth = '300px';
    this.centerPanel.style.backgroundColor = '#1a1a1a';
    this.centerPanel.style.overflow = 'hidden';
    this.container.appendChild(this.centerPanel);

    // Right Resizer (between center and right)
    this.rightResizer = this.createResizer('vertical');
    this.rightResizer.style.cursor = 'col-resize';
    this.container.appendChild(this.rightResizer);

    // Right Panel
    this.rightPanel = document.createElement('div');
    this.rightPanel.id = 'proofer-right-panel';
    this.rightPanel.style.display = 'flex';
    this.rightPanel.style.flexDirection = 'column';
    this.rightPanel.style.width = '350px';
    this.rightPanel.style.minWidth = '200px';
    this.rightPanel.style.maxWidth = '600px';
    this.rightPanel.style.overflowY = 'auto';
    this.rightPanel.style.backgroundColor = '#f5f5f5';
    this.rightPanel.style.position = 'relative';
    this.container.appendChild(this.rightPanel);

    // Setup resize handlers
    this.setupResizers();
  }

  /**
   * Create a resizer element
   */
  private createResizer(orientation: 'vertical' | 'horizontal'): HTMLElement {
    const resizer = document.createElement('div');
    resizer.className = 'panel-resizer';
    resizer.style.width = orientation === 'vertical' ? '4px' : '100%';
    resizer.style.height = orientation === 'vertical' ? '100%' : '4px';
    resizer.style.backgroundColor = '#ccc';
    resizer.style.position = 'relative';
    resizer.style.userSelect = 'none';
    resizer.style.transition = 'background-color 0.2s';
    
    // Hover effect
    resizer.addEventListener('mouseenter', () => {
      resizer.style.backgroundColor = '#007bff';
    });
    resizer.addEventListener('mouseleave', () => {
      if (!this.isResizing) {
        resizer.style.backgroundColor = '#ccc';
      }
    });

    return resizer;
  }

  /**
   * Setup resize event handlers
   */
  private setupResizers(): void {
    // Left resizer (resizes left panel)
    this.leftResizer.addEventListener('mousedown', (e) => {
      this.startResize(e, this.leftResizer, 'left');
    });

    // Right resizer (resizes right panel)
    this.rightResizer.addEventListener('mousedown', (e) => {
      this.startResize(e, this.rightResizer, 'right');
    });

    // Global mouse move and up handlers
    document.addEventListener('mousemove', (e) => this.handleResize(e));
    document.addEventListener('mouseup', () => this.stopResize());
  }

  /**
   * Start resizing
   */
  private startResize(e: MouseEvent, resizer: HTMLElement, side: 'left' | 'right'): void {
    e.preventDefault();
    this.isResizing = true;
    this.currentResizer = resizer;
    resizer.style.backgroundColor = '#007bff';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Handle resize
   */
  private handleResize(e: MouseEvent): void {
    if (!this.isResizing || !this.currentResizer) return;

    const containerRect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;

    if (this.currentResizer === this.leftResizer) {
      // Resize left panel
      const newWidth = mouseX;
      const minWidth = 200;
      const maxWidth = 600;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      this.leftPanel.style.width = `${clampedWidth}px`;
    } else if (this.currentResizer === this.rightResizer) {
      // Resize right panel
      const containerWidth = containerRect.width;
      const newWidth = containerWidth - mouseX;
      const minWidth = 200;
      const maxWidth = 600;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      this.rightPanel.style.width = `${clampedWidth}px`;
    }

    // Trigger resize event for engine (similar to configurator)
    // This ensures the viewport updates when panels are resized
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 10);
  }

  /**
   * Stop resizing
   */
  private stopResize(): void {
    if (this.isResizing) {
      this.isResizing = false;
      if (this.currentResizer) {
        this.currentResizer.style.backgroundColor = '#ccc';
      }
      this.currentResizer = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }

  /**
   * Initialize all panel components
   */
  private initializePanels(): void {
    // Left Panel Components
    this.fileUploadPanel = new FileUploadPanel(this.leftPanel, this.controller);
    this.parsedLayersPanel = new ParsedLayersPanel(this.leftPanel, this.controller);
    this.manualOverridePanel = new ManualOverridePanel(this.leftPanel, this.controller);

    // Right Panel Components
    this.printOptionsPanel = new PrintOptionsPanel(this.rightPanel, this.controller);
    this.edgeFinishPanel = new EdgeFinishPanel(this.rightPanel, this.controller);
    this.layerAssignmentPanel = new LayerAssignmentPanel(this.rightPanel, this.controller);
    this.artworkTransformPanel = new ArtworkTransformPanel(this.rightPanel, this.controller);
    this.approvalPanel = new ApprovalPanel(this.rightPanel, this.controller);
  }

  /**
   * Get center panel (for canvas insertion)
   */
  getCenterPanel(): HTMLElement {
    return this.centerPanel;
  }

  /**
   * Dispose of layout
   */
  dispose(): void {
    // Panels will clean up themselves
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

