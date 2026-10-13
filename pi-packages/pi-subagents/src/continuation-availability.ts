import { readSubagentsConfig } from './config.js';

/** Current effective config, constrained by live tool registration when available. */
export function continuationAvailable(cwd: string, pi?: any): boolean {
  if (!readSubagentsConfig(cwd).enable_continue) return false;
  if (typeof pi?.getAllTools !== 'function') return true;
  return pi
    .getAllTools()
    .some(
      (tool: any) =>
        (typeof tool === 'string' ? tool : tool?.name) === 'subagent_continue',
    );
}
