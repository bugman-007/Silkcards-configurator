/**
 * Proofer Layout Component
 * 
 * 3-panel layout for the Proofer application
 */

import { FileUploadPanel } from './leftPanel/FileUploadPanel.js';
import { ParsedLayersPanel } from './leftPanel/ParsedLayersPanel.js';
import { ManualOverridePanel } from './leftPanel/ManualOverridePanel.js';
import { PrintOptionsPanel } from './rightPanel/PrintOptionsPanel.js';
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

  // Panel components
  private fileUploadPanel: FileUploadPanel;
  private parsedLayersPanel: ParsedLayersPanel;
  private manualOverridePanel: ManualOverridePanel;
  private printOptionsPanel: PrintOptionsPanel;
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
    // Create container with CSS Grid
    this.container.style.display = 'grid';
    this.container.style.gridTemplateColumns = '300px 1fr 350px';
    this.container.style.gridTemplateRows = '1fr';
    this.container.style.height = '100vh';
    this.container.style.width = '100vw';
    this.container.style.overflow = 'hidden';

    // Left Panel
    this.leftPanel = document.createElement('div');
    this.leftPanel.id = 'proofer-left-panel';
    this.leftPanel.style.display = 'flex';
    this.leftPanel.style.flexDirection = 'column';
    this.leftPanel.style.borderRight = '1px solid #ccc';
    this.leftPanel.style.overflowY = 'auto';
    this.leftPanel.style.backgroundColor = '#f5f5f5';
    this.container.appendChild(this.leftPanel);

    // Center Panel (Viewport)
    this.centerPanel = document.createElement('div');
    this.centerPanel.id = 'proofer-center-panel';
    this.centerPanel.style.position = 'relative';
    this.centerPanel.style.backgroundColor = '#1a1a1a';
    this.centerPanel.style.overflow = 'hidden';
    this.container.appendChild(this.centerPanel);

    // Right Panel
    this.rightPanel = document.createElement('div');
    this.rightPanel.id = 'proofer-right-panel';
    this.rightPanel.style.display = 'flex';
    this.rightPanel.style.flexDirection = 'column';
    this.rightPanel.style.borderLeft = '1px solid #ccc';
    this.rightPanel.style.overflowY = 'auto';
    this.rightPanel.style.backgroundColor = '#f5f5f5';
    this.container.appendChild(this.rightPanel);
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

