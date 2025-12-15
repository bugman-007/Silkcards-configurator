/**
 * Layer Assignment Panel
 * 
 * Assigns parsed plates to print options
 */

import { ProoferController } from '../../state/ProoferController.js';
import { ParsedPlate, LayerType, CardSide } from '../../state/ProoferState.js';

/**
 * Layer Assignment Panel
 * 
 * Manages plate-to-option assignments
 */
export class LayerAssignmentPanel {
  private container: HTMLElement;
  private controller: ProoferController;

  constructor(parent: HTMLElement, controller: ProoferController) {
    this.controller = controller;
    this.container = document.createElement('div');
    this.container.className = 'layer-assignment-panel';
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
    title.textContent = 'Layer Assignment';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    this.container.appendChild(title);

    const description = document.createElement('p');
    description.textContent = 'Assign plates to print options';
    description.style.fontSize = '12px';
    description.style.color = '#6c757d';
    description.style.margin = '0 0 16px 0';
    this.container.appendChild(description);
  }

  /**
   * Setup state listeners
   */
  private setupListeners(): void {
    this.controller.addListener((state) => {
      this.renderAssignments(state);
    });
  }

  /**
   * Render assignments
   */
  private renderAssignments(state: any): void {
    // Clear existing assignments
    const existing = this.container.querySelectorAll('.assignment-item');
    existing.forEach(el => el.remove());

    const options = ['foil', 'uv', 'emboss', 'diecut'] as const;

    options.forEach(option => {
      if (state.optionStates[option].enabled) {
        const assignmentDiv = this.createAssignmentControl(
          option,
          state.parsedPlates,
          state.plateAssignments,
          state.optionStates[option].side
        );
        this.container.appendChild(assignmentDiv);
      }
    });
  }

  /**
   * Create assignment control
   */
  private createAssignmentControl(
    option: 'foil' | 'uv' | 'emboss' | 'diecut',
    plates: ParsedPlate[],
    assignments: Record<string, { type: LayerType; side: CardSide }>,
    targetSide: CardSide
  ): HTMLElement {
    const assignmentDiv = document.createElement('div');
    assignmentDiv.className = 'assignment-item';
    assignmentDiv.style.marginBottom = '16px';

    const label = document.createElement('label');
    label.textContent = `${option.charAt(0).toUpperCase() + option.slice(1)}:`;
    label.style.display = 'block';
    label.style.fontSize = '12px';
    label.style.marginBottom = '4px';
    label.style.fontWeight = '600';
    assignmentDiv.appendChild(label);

    const select = document.createElement('select');
    select.id = `assign-${option}`;
    select.style.width = '100%';
    select.style.padding = '8px';

    // Empty option
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- None --';
    select.appendChild(emptyOption);

    // Filter plates by side and type compatibility
    const compatiblePlates = plates.filter(plate => {
      // Check if plate matches target side
      if (plate.side !== targetSide) return false;
      
      // Check if plate type is compatible with option
      // (This is a simplified check - real logic would be more complex)
      return true; // For now, allow any plate
    });

    compatiblePlates.forEach(plate => {
      const optionEl = document.createElement('option');
      optionEl.value = plate.id;
      optionEl.textContent = `${plate.filename} (${plate.type})`;
      
      // Check if this plate is already assigned to this option
      const assignment = assignments[plate.id];
      if (assignment && assignment.type === option) {
        optionEl.selected = true;
      }
      
      select.appendChild(optionEl);
    });

    assignmentDiv.appendChild(select);

    // Event listener
    select.addEventListener('change', () => {
      const plateId = select.value;
      if (plateId) {
        this.controller.assignPlate(plateId, option, targetSide);
        console.log(`[Proofer] Assigned plate ${plateId} to ${option}`);
      } else {
        // Find and unassign
        const state = this.controller.getState();
        const assignedPlateId = Object.keys(state.plateAssignments).find(
          id => state.plateAssignments[id].type === option
        );
        if (assignedPlateId) {
          this.controller.unassignPlate(assignedPlateId);
          console.log(`[Proofer] Unassigned plate from ${option}`);
        }
      }
    });

    return assignmentDiv;
  }
}

