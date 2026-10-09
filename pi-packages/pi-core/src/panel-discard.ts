import { normalizePanelKey } from './panel-input.js';
import { type PanelRow, panelHintRow } from './panel-primitives.js';

/** Confirmation is separate from persistence; the owner decides what is dirty. */
export class PanelDiscardConfirmation {
  active = false;

  request(dirty: boolean): 'confirm' | 'cancel' {
    this.active = dirty;
    return dirty ? 'confirm' : 'cancel';
  }

  handleInput(data: string): 'discard' | 'resume' | undefined {
    if (!this.active) return undefined;
    const key = normalizePanelKey(data);
    const result =
      key.toLowerCase() === 'd'
        ? 'discard'
        : key === 'escape' || key.toLowerCase() === 'k'
          ? 'resume'
          : undefined;
    if (result) this.active = false;
    return result;
  }

  rows(): PanelRow[] {
    return [panelHintRow('d discard and close · k or esc keep editing')];
  }
}
