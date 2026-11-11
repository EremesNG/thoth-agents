import { createHash } from 'node:crypto';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { expect, it } from 'vitest';
import { HistoryPanel } from '../src/history-panel.js';
import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { provider, uiSession } from './work-panel-fixture.js';

const digest = (rows: string[]) =>
  createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const theme = {
  fg: (role: string, value: string) =>
    `\x1b[${role === 'accent' ? 36 : role === 'dim' ? 90 : 37}m${value}\x1b[39m`,
};

// Golden bytes captured from the pre-adoption renderers, including ANSI boundaries.
it.each([
  false,
  true,
])('shares English history chrome at empty, narrow and split layouts (kit: %s)', (themed) => {
  const token = themed
    ? registerRenderKit(createTestRenderKit(), {})
    : undefined;
  const history = (empty: boolean) =>
    new HistoryPanel(
      {
        items: () => (empty ? [] : ['first', 'second']),
        id: (id) => id,
        renderItemLabel: (id) => `task ${id}`,
        renderContent: () => ['界 evidence', 'a\nb\tc', 'last'],
        renderHeader: () => ({
          badge: 'running',
          shortcuts: 'x cancel ',
          wideRows: ['metadata', 'extra'],
          narrowRows: ['metadata', 'extra'],
        }),
      },
      {
        title: 'History',
        titleIcon: () => '*',
        maxLines: 14,
        theme,
        onClose() {},
      },
    );
  try {
    for (const empty of [true, false]) {
      for (const width of [30, 60, 120]) {
        const panel = history(empty);
        try {
          const rows = panel.render(width).map(stripTerminalSequences);
          expect(rows).toHaveLength(14);
          expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
          expect(rows[0]).toContain('Close');
          expect(rows.slice(1).join(String.fromCharCode(10))).not.toContain(
            'Close',
          );
          expect(rows.join(String.fromCharCode(10))).not.toContain('x cancel');
          if (!empty && width >= 60) {
            expect(rows.join(String.fromCharCode(10))).toContain('metadata');
            expect(rows.join(String.fromCharCode(10))).toContain('界 evidence');
          }
        } finally {
          panel.dispose();
        }
      }
    }
  } finally {
    if (token) withdrawRenderKit(token);
  }
});

it.each([
  false,
  true,
])('preserves work detail card bytes through public host rendering (kit: %s)', async (themed) => {
  const token = themed
    ? registerRenderKit(createTestRenderKit(), {})
    : undefined;
  const session = uiSession();
  session.ui.theme.fg = theme.fg;
  const unregister = registerWorkPanelProvider(session.ctx, {
    ...provider(),
    detail: () => ({
      id: 'agents-1',
      title: 'Details 界',
      status: 'completed',
      subtitle: 'summary',
      metadata: [{ label: 'model', value: 'provider/model' }],
      foldedSections: [{ id: 'section', label: 'Notes', text: 'one\ntwo' }],
      evidence: { label: 'Evidence', text: 'first\nlast' },
    }),
  });
  const release = await ensureWorkPanel(session.ctx);
  try {
    session.key('\x1b[D');
    session.key('\r');
    expect(
      [30, 60, 100].map((width) => digest(session.customRender(width))),
    ).toEqual(
      themed
        ? [
            'a563bb180ab5fa4cbd4460c0e0d5d33c93b510c3b522d6d0a539e5ddad504c1d',
            'd2dbe53a035f3f516915a48119a62d2d073aa1729916496ce4308507c15b65f5',
            '004bc936b1d592f82f30bc217db61339dd27cf9401c8fb6fec7444beb235a71c',
          ]
        : [
            '8fa9f6e22623bb1dee5509655d3c04871453727068e6f8cb6b6df2b0dcf95c42',
            'f77218468eebbdeed30d7b1c5ad0767a30295b723b16eab35efc5147c81b7cbe',
            '76d7515911d4ff8180e6b5476040b64b9dd277858ea79853181473b5752a8a42',
          ],
    );
  } finally {
    session.closeCustom();
    release();
    unregister();
    if (token) withdrawRenderKit(token);
  }
});

it('routes native encoded work-panel focus, navigation and detail keys through shared input', async () => {
  const session = uiSession();
  const unregister = registerWorkPanelProvider(session.ctx, provider());
  const release = await ensureWorkPanel(session.ctx);
  try {
    expect(session.key('\x1b[57417u')).toEqual({ consume: true });
    // Work focus keeps native semantics, not the list editor's Ctrl-C alias.
    for (const data of ['\x03', '\x1b[99;5u', '\x1b[99;5:1u'])
      expect(session.key(data)).toBeUndefined();
    expect(session.key('\x1b[13u')).toEqual({ consume: true });
    expect(session.customRender().join('\n')).toContain('Agents item');
    session.customKey('\x1b[27u');
    await Promise.resolve();
    expect(session.listenerCount()).toBe(1);
  } finally {
    session.closeCustom();
    release();
    unregister();
  }
});
