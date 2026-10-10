import type {
  RenderStatus,
  SemanticFrameName,
  SemanticGlyphName,
} from '@thoth-agents/pi-core';
import type { IconMode } from './config.ts';

type Variants = Record<IconMode, string>;

/** Theme-local tool icon that is not a pi-core semantic name. */
export type ThemeIconName = SemanticGlyphName | 'powershell';
export type StatusIconName = RenderStatus | 'warning';

/** The single source of rendered semantic glyphs for the theme. */
const ICONS: Record<ThemeIconName, Variants> = {
  branch: { nerd: '\u{e0a0}', unicode: '⑂', ascii: 'git' },
  folder: { nerd: '\u{f07c}', unicode: 'dir', ascii: 'dir' },
  model: { nerd: '\u{f06a9}', unicode: '●', ascii: '*' },
  effort: { nerd: '\u{f09d1}', unicode: '◐', ascii: 'o' },
  context: { nerd: '\u{f2db}', unicode: 'ctx', ascii: 'ctx' },
  elapsed: { nerd: '', unicode: '◷', ascii: 'elapsed' },
  cost: { nerd: '\u{f155}', unicode: '$', ascii: '$' },
  tokensIn: { nerd: '\u{f062}', unicode: '↑', ascii: '^' },
  tokensOut: { nerd: '\u{f063}', unicode: '↓', ascii: 'v' },
  cache: { nerd: '\u{f01bc}', unicode: 'cache', ascii: 'cache' },
  throughput: { nerd: '\u{f04c5}', unicode: 'tok/s', ascii: 'tok/s' },
  agent: { nerd: '\u{f08c7}', unicode: '⚙', ascii: '@' },
  file: { nerd: '\u{f0214}', unicode: 'file', ascii: '[file]' },
  tool: { nerd: '\u{f0ad}', unicode: '*', ascii: '*' },
  bash: { nerd: '\u{f489}', unicode: '$', ascii: '$' },
  powershell: { nerd: '\u{e70f}', unicode: 'PS', ascii: 'PS' },
  read: { nerd: '\u{f06e}', unicode: 'read', ascii: '[read]' },
  write: { nerd: '\u{f0c7}', unicode: 'write', ascii: '[write]' },
  edit: { nerd: '\u{f044}', unicode: 'edit', ascii: '[edit]' },
  search: { nerd: '\u{f002}', unicode: 'search', ascii: '?' },
  separator: { nerd: '·', unicode: '·', ascii: '|' },
  ellipsis: { nerd: '…', unicode: '…', ascii: '...' },
  arrowUp: { nerd: '↑', unicode: '↑', ascii: '^' },
  arrowDown: { nerd: '↓', unicode: '↓', ascii: 'v' },
  arrowLeft: { nerd: '←', unicode: '←', ascii: '<' },
  arrowRight: { nerd: '→', unicode: '→', ascii: '>' },
  selection: { nerd: '›', unicode: '›', ascii: '>' },
  selectionSelected: { nerd: '\u{f111}', unicode: '●', ascii: '*' },
  selectionUnselected: { nerd: '\u{f10c}', unicode: '○', ascii: 'o' },
  taskInProgress: { nerd: '◐', unicode: '◇', ascii: '*' },
  separatorHeavy: { nerd: '┃', unicode: '┃', ascii: '|' },
  boxTopLeft: { nerd: '╭', unicode: '╭', ascii: '+' },
  boxTopRight: { nerd: '╮', unicode: '╮', ascii: '+' },
  boxVertical: { nerd: '│', unicode: '│', ascii: '|' },
  boxBottomLeft: { nerd: '╰', unicode: '╰', ascii: '+' },
  boxBottomRight: { nerd: '╯', unicode: '╯', ascii: '+' },
  boxHorizontal: { nerd: '─', unicode: '─', ascii: '-' },
  boxTDown: { nerd: '┬', unicode: '┬', ascii: '+' },
  boxTUp: { nerd: '┴', unicode: '┴', ascii: '+' },
  boxTRight: { nerd: '├', unicode: '├', ascii: '+' },
  boxTLeft: { nerd: '┤', unicode: '┤', ascii: '+' },
  boxCross: { nerd: '┼', unicode: '┼', ascii: '+' },
  close: { nerd: '\u{f00d}', unicode: '✕', ascii: 'x' },
  scrollUp: { nerd: '↑', unicode: '↑', ascii: '^' },
  scrollDown: { nerd: '↓', unicode: '↓', ascii: 'v' },
  ready: { nerd: '▲', unicode: '▲', ascii: '^' },
  warning: { nerd: '\u{f071}', unicode: '⚠', ascii: '!' },
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const WORKING_FRAMES = ['△', '◭', '▲', '◮'];

const FRAMES: Record<SemanticFrameName, Record<IconMode, readonly string[]>> = {
  spinnerFrames: {
    nerd: SPINNER_FRAMES,
    unicode: SPINNER_FRAMES,
    ascii: ['|', '/', '-', '\\'],
  },
  workingFrames: {
    nerd: WORKING_FRAMES,
    unicode: WORKING_FRAMES,
    ascii: ['.', 'o', 'O', '0'],
  },
};

const STOP: Variants = { nerd: '\uf05e', unicode: '■', ascii: '/' };
const BLOCKED: Variants = { nerd: '\uf05e', unicode: '⊘', ascii: '/' };

const STATUS_ICONS: Record<StatusIconName, Variants> = {
  pending: { nerd: '\u{f10c}', unicode: '○', ascii: '-' },
  queued: { nerd: '\u{f051f}', unicode: '○', ascii: '~' },
  in_progress: { nerd: '◐', unicode: '◐', ascii: '*' },
  running: { nerd: '◐', unicode: '◐', ascii: '*' },
  completed: { nerd: '\u{f00c}', unicode: '✓', ascii: '+' },
  failed: { nerd: '\u{f00d}', unicode: '✗', ascii: 'x' },
  cancelled: STOP,
  interrupted: STOP,
  stopping: STOP,
  deleted: BLOCKED,
  blocked: BLOCKED,
  warning: { nerd: '\u{f071}', unicode: '!', ascii: '!' },
  unknown: { nerd: '\u{f128}', unicode: '?', ascii: '?' },
};

export function icon(name: ThemeIconName, mode: IconMode): string {
  return ICONS[name][mode];
}

export function frames(
  name: SemanticFrameName,
  mode: IconMode,
): readonly string[] {
  return FRAMES[name][mode];
}

export function statusIcon(status: StatusIconName, mode: IconMode): string {
  return STATUS_ICONS[status][mode];
}
