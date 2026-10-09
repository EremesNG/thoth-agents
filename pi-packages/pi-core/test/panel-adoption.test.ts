import { createHash } from 'node:crypto';
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
])('preserves history frame bytes at empty, narrow and split layouts (kit: %s)', (themed) => {
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
    const hashes = [true, false].flatMap((empty) =>
      [30, 60, 120].map((width) => {
        const panel = history(empty);
        try {
          return digest(panel.render(width));
        } finally {
          panel.dispose();
        }
      }),
    );
    expect(hashes).toEqual(
      themed
        ? [
            '8c2bafe3271cd32939aa5f89315e1f99bc002237e578e9cb0f440b1ccc352ab5',
            'f9b4f15d29a87a1c889b0d9bb6ea820f37f2ce181caa299d1a527c9e530d37c0',
            '0567da72cb49145eb0a9974b0dea1cceb55fe99f4f93cf62979893df141c9e1b',
            'c41b94e448bbf7294ab34a1e58f9cea2c05cbe1bd36b87fd98c497384cce0474',
            '2da81b8404f23b9d3296006d1a307f8596ddd6f51c2bca7ee7731f8473d6a557',
            '616228e90959ef4995cd4fa3f79f6a3822c4bdcec9695edcf12c3f67d11d8403',
          ]
        : [
            '94330909480431561033984c53c28de2da8c9ddaac7716df99d87583c8cf0659',
            '169cbb63395ad0c6936ee989b36f7d9de0e7fb55b7a08dd0db80bf4beeee6291',
            'c79e3557f66c46d5d0877b22eda865ea7d4337c0684bd1ef49e147932037b78d',
            'fc074fabab70e4d29690c14866ebb43f92965ee1454ab73402f260f3fa06ce55',
            'e35fe5485b3e51facb59952614692e8ab194cbedb440b7f0622e2ad0e8df28a5',
            'a9613e3b11696705a4d5aa7961ac038d34031ad1fe34d5e80e2e797f7351bebb',
          ],
    );
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
