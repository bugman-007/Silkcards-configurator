/**
 * Approval Panel
 * 
 * Shows warnings and handles proof approval
 */

import { ProoferController } from '../../state/ProoferController.js';
import { exportPayload } from '../../io/exportPayload.js';
import { ProoferPayload } from '../../../../shared/types/prooferPayload.js';

/**
 * Approval Panel
 * 
 * Manages approval workflow and warnings
 */
export class ApprovalPanel {
  private container: HTMLElement;
  private controller: ProoferController;
  private warningsContainer: HTMLElement;
  private approveButton: HTMLButtonElement;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'approval-panel';
    this.container.style.padding = '16px';
    parent.appendChild(this.container);

    this.createUI();
    this.setupListeners();
  }

  /**
   * Create UI elements
   */
  private createUI(): void {
    const title = document.createElement('h3');
    title.textContent = 'Approval';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    // Warnings container
    this.warningsContainer = document.createElement('div');
    this.warningsContainer.className = 'warnings-container';
    this.warningsContainer.style.marginBottom = '16px';
    this.container.appendChild(this.warningsContainer);

    // Approve button
    this.approveButton = document.createElement('button');
    this.approveButton.textContent = 'Approve Proof';
    this.approveButton.style.width = '100%';
    this.approveButton.style.padding = '12px';
    this.approveButton.style.backgroundColor = '#28a745';
    this.approveButton.style.color = 'white';
    this.approveButton.style.border = 'none';
    this.approveButton.style.borderRadius = '4px';
    this.approveButton.style.cursor = 'pointer';
    this.approveButton.style.fontSize = '14px';
    this.approveButton.style.fontWeight = '600';
    this.container.appendChild(this.approveButton);

    this.approveButton.addEventListener('click', () => {
      this.handleApproval();
    });
  }

  /**
   * Setup state listeners
   */
  private setupListeners(): void {
    this.controller.addListener((state) => {
      this.renderWarnings(state.warnings);
      this.updateApproveButton(state.approved);
    });
  }

  /**
   * Render warnings
   */
  private renderWarnings(warnings: any[]): void {
    this.warningsContainer.innerHTML = '';

    if (warnings.length === 0) {
      const noWarnings = document.createElement('div');
      noWarnings.textContent = 'No warnings';
      noWarnings.style.fontSize = '12px';
      noWarnings.style.color = '#6c757d';
      noWarnings.style.fontStyle = 'italic';
      this.warningsContainer.appendChild(noWarnings);
      return;
    }

    warnings.forEach(warning => {
      const warningDiv = document.createElement('div');
      warningDiv.style.padding = '8px';
      warningDiv.style.marginBottom = '8px';
      warningDiv.style.borderRadius = '4px';
      warningDiv.style.fontSize = '12px';

      switch (warning.severity) {
        case 'error':
          warningDiv.style.backgroundColor = '#f8d7da';
          warningDiv.style.color = '#721c24';
          break;
        case 'warning':
          warningDiv.style.backgroundColor = '#fff3cd';
          warningDiv.style.color = '#856404';
          break;
        default:
          warningDiv.style.backgroundColor = '#d1ecf1';
          warningDiv.style.color = '#0c5460';
      }

      warningDiv.textContent = warning.message;
      this.warningsContainer.appendChild(warningDiv);
    });
  }

  /**
   * Update approve button state
   */
  private updateApproveButton(approved: boolean): void {
    if (approved) {
      this.approveButton.textContent = 'Approved';
      this.approveButton.style.backgroundColor = '#6c757d';
      this.approveButton.disabled = true;
    } else {
      this.approveButton.textContent = 'Approve Proof';
      this.approveButton.style.backgroundColor = '#28a745';
      this.approveButton.disabled = false;
    }
  }

  /**
   * Handle approval
   */
  private handleApproval(): void {
    console.log('[Proofer] Approval requested');
    
    const state = this.controller.getState();
    
    // Create payload
    const payload: ProoferPayload = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      dimensions: {
        width: state.width,
        height: state.height,
        thickness: state.thickness,
        cornerRadius: state.cornerRadius
      },
      layers: {
        foil: {},
        uv: {},
        emboss: {},
        diecut: {}
      }
    };

    // Export payload
    exportPayload(payload);
    
    // Set approved
    this.controller.setApproved(true);
    
    console.log('[Proofer] Proof approved and exported');
  }
}

