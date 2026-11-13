import { expect, test } from 'vitest';
import {
  NativeActivityFolder,
  type NativeToolActivity,
} from '../src/native-display.js';

test.each([
  'completed',
  'failed',
])('retains %s metadata through trailing content and repeated terminal updates until turn end', (status) => {
  const entries: NativeToolActivity[] = [];
  const folder = new NativeActivityFolder((event) => entries.push(event));
  folder.add({
    toolCallId: 'one',
    title: 'Read file',
    kind: 'read',
    status: 'in_progress',
  });
  folder.add({ toolCallId: 'one', status });
  folder.add({
    toolCallId: 'one',
    content: [{ type: 'text', text: 'late output' }],
  });
  folder.add({ toolCallId: 'one', status });
  folder.flush();
  folder.flush();
  expect(entries).toEqual([
    {
      toolCallId: 'one',
      title: 'Read file',
      kind: 'read',
      status,
      content: [{ type: 'text', text: 'late output' }],
    },
  ]);
  folder.add({ toolCallId: 'one', title: 'Next turn' });
  folder.flush();
  expect(entries).toHaveLength(2);
  expect(entries[1].title).toBe('Next turn');
});
