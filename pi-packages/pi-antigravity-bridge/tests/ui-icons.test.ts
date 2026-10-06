import type {
  ExtensionUIContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, test } from 'vitest';
import { artifactItems, showArtifactsBrowser } from '../src/artifacts-ui.js';
import { showEnginePicker } from '../src/engine-picker.js';
import { taskItems, showTasksBrowser } from '../src/tasks-ui.js';

test('browser item separators follow the kit even after item construction', () => {
  const artifact = artifactItems([
    {
      name: 'report',
      kind: 'file',
      mediaType: 'text/plain',
      bytes: 10,
      modifiedMs: 0,
    } as never,
  ])[0];
  const task = taskItems([
    {
      id: 1,
      bytes: 10,
      modifiedMs: 0,
      active: true,
      livenessKnown: true,
    } as never,
  ])[0];
  expect(artifact.description).toContain('file · text/plain · 10B ·');
  expect(task.label).toBe('#1 · ACTIVE');
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => (name === 'separator' ? '|' : name),
    }),
    {},
  );
  try {
    expect(artifact.description).toContain('file | text/plain | 10B |');
    expect(task.label).toBe('#1 | ACTIVE');
    expect(task.description).toContain('10B | last write');
  } finally {
    withdrawRenderKit(token);
  }
});

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

test.each([
  'engine',
  'artifacts',
  'tasks',
] as const)('mounted %s navigation hints follow kit registration and withdrawal', async (surface) => {
  let component: Component | undefined;
  const ctx = {
    custom: async (
      build: (
        tui: unknown,
        theme: Theme,
        keys: unknown,
        done: () => void,
      ) => Component,
    ) => {
      component = build({ requestRender() {} }, theme, {}, () => {});
    },
  } as unknown as ExtensionUIContext;
  if (surface === 'engine') await showEnginePicker(ctx);
  if (surface === 'artifacts') await showArtifactsBrowser(ctx, [{ name: 'report', kind: 'file', mediaType: 'text/plain', bytes: 10, modifiedMs: 0 } as never]);
  if (surface === 'tasks') await showTasksBrowser(ctx, [{ id: 1, bytes: 10, modifiedMs: 0, active: true, livenessKnown: true } as never], true);
  if (!component) throw new Error('overlay missing');
  const native = component.render(100);
  expect(native.join('\n')).toContain('↑↓ navigate ·');
  expect(native.some((line) => line.startsWith('→ '))).toBe(true);
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) =>
        name === 'arrowUp'
          ? '^'
          : name === 'arrowDown'
            ? 'v'
            : name === 'separator'
              ? '|'
              : name === 'selection'
                ? '>'
                : name,
    }),
    {},
  );
  try {
    expect(component.render(100).join('\n')).toContain('^v navigate |');
    expect(component.render(100).some((line) => line.startsWith('> '))).toBe(true);
  } finally {
    withdrawRenderKit(token);
  }
  expect(component.render(100)).toEqual(native);
});
