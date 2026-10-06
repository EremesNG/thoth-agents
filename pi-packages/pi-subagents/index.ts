export { default } from './src/extension/subagents-extension.js';
export {
  completionMessage,
  renderSubagentCompletionMessage,
  sendSubagentCompletionMessage,
} from './src/render/completion-message.js';
export { createSubagentsPanelKeyMatcher } from './src/ui/panel-input.js';
export { resolveRegisteredToolDefinition } from './src/ui/panel-overlay.js';
export { createSubagentsWorkPanelProvider } from './src/ui/work-panel-provider.js';
