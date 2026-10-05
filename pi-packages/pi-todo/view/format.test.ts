import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import { makeTheme } from '../test/helpers.js';
import type { Task } from '../tool/types.js';
import {
  ACTION_GLYPH,
  formatOverlayTaskLine,
  overlayStatusGlyph,
  STATUS_GLYPH,
} from './format.js';

const recordingTheme = makeTheme({
  fg: (color, text) => `<${color}>${text}</${color}>`,
  strikethrough: (text) => `<strike>${text}</strike>`,
}) as unknown as Theme;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    subject: 'quiet task',
    status: 'pending',
    ...overrides,
  };
}

it('uses single-cell action, status, overlay and dependency glyphs', () => {
  const theme = makeTheme();
  const overlayGlyphs = (
    ['pending', 'in_progress', 'completed', 'deleted'] as const
  ).map((status) => overlayStatusGlyph(status, theme));
  for (const glyph of [
    ...Object.values(ACTION_GLYPH),
    ...Object.values(STATUS_GLYPH),
    ...overlayGlyphs,
    '⛓',
  ]) {
    expect(visibleWidth(glyph), glyph).toBe(1);
  }
});

describe('formatOverlayTaskLine — semantic color hierarchy', () => {
  it('keeps pending subjects primary while rendering IDs quietly', () => {
    expect(formatOverlayTaskLine(task(), recordingTheme, true)).toBe(
      '<dim>○</dim> <dim>#1</dim> <text>quiet task</text>',
    );
  });

  it('emphasizes the current task while muting its supporting metadata', () => {
    expect(
      formatOverlayTaskLine(
        task({
          status: 'in_progress',
          activeForm: 'Working',
          blockedBy: [2, 3],
        }),
        recordingTheme,
        true,
      ),
    ).toBe(
      '<warning>◐</warning> <dim>#1</dim> <accent>quiet task</accent> <muted>(Working)</muted> <muted>⛓ #2,#3</muted>',
    );
  });

  it('mutes and strikes completed subjects', () => {
    expect(
      formatOverlayTaskLine(
        task({ status: 'completed' }),
        recordingTheme,
        false,
      ),
    ).toBe('<success>✓</success> <strike><muted>quiet task</muted></strike>');
  });
});

describe('formatOverlayTaskLine — terminal control characters', () => {
  it('strips escape sequences from subject and activeForm before theming', () => {
    expect(
      formatOverlayTaskLine(
        task({
          status: 'in_progress',
          subject: 'quiet\u001b[2Jtask',
          activeForm: 'Work\u009bcing',
        }),
        recordingTheme,
        false,
      ),
    ).toBe(
      '<warning>◐</warning> <accent>quiettask</accent> <muted>(Working)</muted>',
    );
  });
});
