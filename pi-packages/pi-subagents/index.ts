export { default } from './src/extension/subagents-extension.js';
export {
  completionMessage,
  renderSubagentCompletionMessage,
  sendSubagentCompletionMessage,
} from './src/render/completion-message.js';
export {
  ClaudeBackgroundWidget,
  ClaudeBackgroundWidgetState,
  moveClaudeBackgroundWidgetSelection,
  renderClaudeBackgroundWidgetLines,
} from './src/ui/background-widget.js';
export { createSubagentsPanelKeyMatcher } from './src/ui/panel-input.js';
export { resolveRegisteredToolDefinition } from './src/ui/panel-overlay.js';
