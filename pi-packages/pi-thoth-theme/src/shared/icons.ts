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
  branch: { nerd: '\u{e0a0}', ascii: 'git' },
  folder: { nerd: '\u{f07c}', ascii: 'dir' },
  model: { nerd: '\u{f06a9}', ascii: '*' },
  effort: { nerd: '\u{f09d1}', ascii: 'o' },
  context: { nerd: '\u{f2db}', ascii: 'ctx' },
  cost: { nerd: '\u{f155}', ascii: '$' },
  tokensIn: { nerd: '\u{f062}', ascii: '^' },
  tokensOut: { nerd: '\u{f063}', ascii: 'v' },
  cache: { nerd: '\u{f01bc}', ascii: 'cache' },
  throughput: { nerd: '\u{f04c5}', ascii: 'tok/s' },
  agent: { nerd: '\u{f08c7}', ascii: '@' },
  file: { nerd: '\u{f0214}', ascii: '[file]' },
  tool: { nerd: '\u{f0ad}', ascii: '*' },
  bash: { nerd: '\u{f489}', ascii: '$' },
  powershell: { nerd: '\u{e70f}', ascii: 'PS' },
  read: { nerd: '\u{f06e}', ascii: '[read]' },
  write: { nerd: '\u{f0c7}', ascii: '[write]' },
  edit: { nerd: '\u{f044}', ascii: '[edit]' },
  search: { nerd: '\u{f002}', ascii: '?' },
  separator: { nerd: '·', ascii: '|' },
  ellipsis: { nerd: '…', ascii: '...' },
  arrowUp: { nerd: '↑', ascii: '^' },
  arrowDown: { nerd: '↓', ascii: 'v' },
  arrowLeft: { nerd: '←', ascii: '<' },
  arrowRight: { nerd: '→', ascii: '>' },
  selection: { nerd: '›', ascii: '>' },
  scrollUp: { nerd: '↑', ascii: '^' },
  scrollDown: { nerd: '↓', ascii: 'v' },
  ready: { nerd: '▲', ascii: '^' },
};

const FRAMES: Record<SemanticFrameName, Record<IconMode, readonly string[]>> = {
  spinnerFrames: {
    nerd: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    ascii: ['|', '/', '-', '\\'],
  },
  workingFrames: {
    nerd: ['△', '◭', '▲', '◮'],
    ascii: ['.', 'o', 'O', '0'],
  },
};

const BAN: Variants = { nerd: '\uf05e', ascii: '/' };

const STATUS_ICONS: Record<StatusIconName, Variants> = {
  pending: { nerd: '\u{f10c}', ascii: '-' },
  queued: { nerd: '\u{f051f}', ascii: '~' },
  in_progress: { nerd: '◐', ascii: '*' },
  running: { nerd: '◐', ascii: '*' },
  completed: { nerd: '\u{f00c}', ascii: '+' },
  failed: { nerd: '\u{f00d}', ascii: 'x' },
  cancelled: BAN,
  interrupted: BAN,
  stopping: BAN,
  deleted: BAN,
  blocked: BAN,
  warning: { nerd: '\u{f071}', ascii: '!' },
  unknown: { nerd: '\u{f128}', ascii: '?' },
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
