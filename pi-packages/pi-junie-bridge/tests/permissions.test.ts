import { expect, test } from 'vitest';
import { requestPermission } from '../src/permissions.js';

const options = [
  { optionId: 'always', kind: 'allow_always' },
  { optionId: 'once', kind: 'allow_once' },
  { optionId: 'deny', kind: 'reject_once' },
];
test('auto-allows only Pi MCP tools, once, without bypassing the native permission seam', async () => {
  expect(
    await requestPermission({
      toolCall: { title: 'pi/read', _meta: { is_mcp_tool_call: true } },
      options,
    }),
  ).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } });
  for (const toolCall of [
    { title: 'Terminal' },
    { title: 'pi/read', _meta: { is_mcp_tool_call: false } },
    { title: 'other/read', _meta: { is_mcp_tool_call: true } },
    { _meta: { is_mcp_tool_call: true } },
  ]) {
    expect(await requestPermission({ toolCall, options })).toEqual({
      outcome: { outcome: 'selected', optionId: 'deny' },
    });
    expect(
      await requestPermission({ toolCall, options }, async () => ({
        native: 'asked',
      })),
    ).toEqual({ native: 'asked' });
  }
  expect(
    await requestPermission({
      toolCall: { title: 'pi/read', _meta: { is_mcp_tool_call: true } },
      options: [options[0]],
    }),
  ).toEqual({ outcome: { outcome: 'cancelled' } });
});
