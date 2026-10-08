import { resolveIcon, resolveStatusGlyph } from '@thoth-agents/pi-core';
import type { TaskStatus } from '../tool/types.js';

/** Task-list glyph for every surface: widget rows, panel and `/todos` text. */
export function taskGlyph(status: TaskStatus): string {
  switch (status) {
    case 'in_progress':
      return resolveIcon('taskInProgress');
    case 'completed':
      return resolveStatusGlyph('completed');
    case 'pending':
      return resolveStatusGlyph('pending');
    case 'deleted':
      return resolveStatusGlyph('deleted');
  }
}
