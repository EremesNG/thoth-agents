import { extname } from 'node:path';
import type { IconMode } from './config.ts';

const icons = {
  file: { nerd: '\uf15b', ascii: '[file]' },
  folder: { nerd: '\uf07b', ascii: '[dir]' },
  read: { nerd: '\uf06e', ascii: '[read]' },
  write: { nerd: '\uf0c7', ascii: '[write]' },
  edit: { nerd: '\uf044', ascii: '[edit]' },
  bash: { nerd: '\uf489', ascii: '$' },
  search: { nerd: '\uf002', ascii: '?' },
  git: { nerd: '\ue702', ascii: 'git' },
  model: { nerd: '\uf4b8', ascii: 'model' },
  context: { nerd: '\uf49d', ascii: 'ctx' },
  cost: { nerd: '\uf155', ascii: '$' },
  ok: { nerd: '\uf00c', ascii: '+' },
  error: { nerd: '\uf00d', ascii: '!' },
} as const;

export type IconName = keyof typeof icons;

export function iconFor(name: IconName, mode: IconMode): string {
  return icons[name][mode];
}

const fileIcons: Record<string, Record<IconMode, string>> = {
  '.ts': { nerd: '\ue628', ascii: '[ts]' },
  '.js': { nerd: '\ue74e', ascii: '[js]' },
  '.json': { nerd: '\ue60b', ascii: '{ }' },
  '.md': { nerd: '\ue609', ascii: '[md]' },
  '.py': { nerd: '\ue606', ascii: '[py]' },
  '.sh': { nerd: '\uf489', ascii: '$' },
};

export function iconForFile(filename: string, mode: IconMode): string {
  const extension = extname(filename).toLowerCase();
  return fileIcons[extension]?.[mode] ?? iconFor('file', mode);
}
