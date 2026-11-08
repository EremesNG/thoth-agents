import type { Plugin } from '@opencode/plugin';
import { buildRetryGuidance } from './guidance';
import { detectDelegateTaskError } from './patterns';

export type DelegationToolEvent = Extract<
  Parameters<Parameters<Plugin.Context['tool']['hook']>[1]>[0],
  { status: 'completed' | 'error' }
>;

// Preserve native error prototypes and non-enumerable diagnostics.
export function appendErrorGuidance(
  event: DelegationToolEvent & { status: 'error' },
  guidance: string,
): void {
  const properties = Object.getOwnPropertyDescriptors(event.error);
  properties.message = {
    value: `${event.error.message}\n${guidance}`,
    configurable: true,
    writable: true,
    enumerable: true,
  };
  // V8's lazy stack accessor needs the original Error's internal slots.
  properties.stack = {
    value: event.error.stack,
    configurable: true,
    writable: true,
    enumerable: false,
  };
  event.error = Object.create(Object.getPrototypeOf(event.error), properties);
}

export function createDelegateTaskRetryHook() {
  return async (event: DelegationToolEvent): Promise<void> => {
    if (event.tool !== 'subagent' || event.status !== 'error') return;
    if (event.error.message.includes('[subagent retry suggestion]')) return;
    const detected = detectDelegateTaskError(event.error.message);
    if (!detected) return;
    appendErrorGuidance(event, buildRetryGuidance(detected));
  };
}
