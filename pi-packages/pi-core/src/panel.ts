/** TUI-only public entrypoint; the root entry remains importable without Pi peers. */

export type {
  EditorSlotContribution,
  EditorSlotHandle,
} from './editor-slot.js';
export { registerEditorSlot } from './editor-slot.js';

export { PanelDiscardConfirmation } from './panel-discard.js';
export type {
  PanelFrameBorderPart,
  PanelFramePart,
  PanelFrameText,
} from './panel-frame.js';
export { createPanelFrame, renderPanelCard } from './panel-frame.js';
export type { PanelOverlayFactory, PanelOverlayHost } from './panel-host.js';
export { openPanelOverlay } from './panel-host.js';
export type { PanelKey, PanelMouseEvent } from './panel-input.js';
export {
  matchesPanelKey,
  normalizePanelKey,
  panelMouseClick,
  panelMouseWheelDelta,
} from './panel-input.js';
export type {
  ListEditorContext,
  ListEditorOptions,
  ListEditorRow,
  ListEditorSaveResult,
  ListEditorState,
  ListEditorView,
} from './panel-list-editor.js';
export { createListEditor, ListEditor } from './panel-list-editor.js';
export type {
  PanelFrameOptions,
  PanelRow,
  PanelRowInput,
  PanelTheme,
  PanelViewport,
} from './panel-primitives.js';
export {
  padPanelText,
  panelFg,
  panelHintRow,
  panelViewport,
  panelVisibleWidth,
  renderPanelFrame,
  renderPanelRow,
  truncatePanelText,
} from './panel-primitives.js';

export {
  renderWorkPanelRow,
  type WorkPanelRowRenderOptions,
} from './work-panel-render.js';
