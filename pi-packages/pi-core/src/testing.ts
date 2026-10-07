import { formatDuration } from './duration.js';
import {
  type RenderRows,
  type RenderStatus,
  renderToolFooter,
  type ThothRenderKit,
} from './render-kit.js';

function clip(text: string, width: number): string {
  return [...text].slice(0, Math.max(0, Math.floor(width))).join('');
}

function rowsAt(
  rows: RenderRows | undefined,
  width: number,
): readonly string[] {
  return typeof rows === 'function' ? rows(width) : (rows ?? []);
}

const brailleFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const glyphs: Record<RenderStatus, string> = {
  pending: '○',
  queued: '○',
  in_progress: '◐',
  running: '◐',
  completed: '✓',
  failed: '✗',
  cancelled: '■',
  interrupted: '■',
  stopping: '■',
  deleted: '⊘',
  blocked: '⊘',
  unknown: '?',
};

/**
 * Plain-text fake with real tree-gutter widths and caller-owned braille frames.
 * Tool footers use elapsed overrides only, without clock reads or state mutation.
 * Omit `icon` to exercise legacy-kit fallbacks, or provide a UI lookup for tests.
 */
export function createTestRenderKit(
  options: Pick<ThothRenderKit, 'icon'> = {},
): ThothRenderKit {
  const kit: ThothRenderKit = {
    version: 1,
    card(theme, options, width) {
      if (!(width > 0)) return [];
      const contentWidth = Math.max(0, Math.floor(width) - 4);
      const lines: string[] = [];
      if (options.part !== 'end') {
        lines.push(
          `╭─${options.isError ? ' !' : ''}${options.title ? ` ${options.title}` : ''}`,
        );
      }
      lines.push(...rowsAt(options.body, contentWidth));
      for (const section of options.sections ?? []) {
        lines.push(
          `├─${section.title ? ` ${section.title}` : ''}`,
          ...rowsAt(section.rows, contentWidth),
        );
      }
      if (options.part !== 'start') {
        const footer =
          options.context && options.status
            ? (options.footer ??
              renderToolFooter(kit, theme, {
                status: options.status,
                context: options.context,
                summary: options.summary,
              }))
            : [options.status, options.footer].filter(Boolean).join(' · ');
        lines.push(`╰─${footer ? ` ${footer}` : ''}`);
      }
      return lines.map((line) => clip(line, width));
    },
    collapse(_theme, rows, options = {}) {
      const budget = Math.max(0, Math.floor(options.budget ?? 8));
      if (options.expanded || rows.length <= budget) return [...rows];
      return [
        ...rows.slice(0, budget),
        `… ${rows.length - budget} more lines · ${options.expandHint ?? 'ctrl+o to expand'}`,
      ];
    },
    cachedComponent(render) {
      const cache = new Map<number, string[]>();
      return {
        render(width) {
          let lines = cache.get(width);
          if (lines === undefined) {
            lines = render(width);
            cache.set(width, lines);
          }
          return lines;
        },
        invalidate() {
          cache.clear();
        },
      };
    },
    indicator(theme, context, options = {}) {
      const status =
        options.status ??
        (context?.isError
          ? 'failed'
          : context?.isPartial
            ? 'running'
            : 'completed');
      const elapsed =
        options.elapsedMs === undefined
          ? ''
          : formatDuration(options.elapsedMs);
      const frame = options.frame;
      const glyph =
        (status === 'running' || status === 'in_progress') &&
        frame !== undefined &&
        Number.isFinite(frame)
          ? brailleFrames[
              ((Math.floor(frame) % brailleFrames.length) +
                brailleFrames.length) %
                brailleFrames.length
            ]
          : kit.statusGlyph(theme, status);
      return {
        glyph,
        elapsedMs: options.elapsedMs,
        elapsed,
        text: [options.label ?? status, elapsed].filter(Boolean).join(' · '),
      };
    },
    toolFooter(theme, options) {
      return renderToolFooter(undefined, theme, {
        ...options,
        context: undefined,
      });
    },
    statusGlyph: (_theme, status) => glyphs[status],
    widgetHeading(theme, options, width) {
      const counts = options.counts
        ? ` (${options.counts.completed}/${options.counts.total})`
        : '';
      return clip(
        [
          options.status ? kit.statusGlyph(theme, options.status) : undefined,
          `${options.title}${counts}`,
          options.suffix,
        ]
          .filter(Boolean)
          .join(' '),
        width,
      );
    },
    treeRow(theme, options, width) {
      const indent = '  '.repeat(Math.max(0, Math.floor(options.depth ?? 0)));
      const rail = options.last ? '└─' : '├─';
      const status = options.status
        ? `${kit.statusGlyph(theme, options.status)} `
        : '';
      return clip(
        `${options.selected ? '› ' : '  '}${indent}${rail} ${status}${options.text}`,
        width,
      );
    },
    fg: (_theme, _role, text) => text,
  };
  if (options.icon) kit.icon = options.icon;
  return kit;
}
