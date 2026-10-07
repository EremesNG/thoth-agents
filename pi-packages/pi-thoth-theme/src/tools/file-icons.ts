import { basename, extname } from 'node:path';
import type { IconMode } from '../shared/config.ts';
import { icon } from '../shared/icons.ts';

const NERD_FILE_ICONS: Record<string, string> = {
  ts: '\ue628',
  tsx: '\ue7ba',
  js: '\ue74e',
  jsx: '\ue7ba',
  mjs: '\ue74e',
  cjs: '\ue74e',
  py: '\ue73c',
  rs: '\ue7a8',
  go: '\ue724',
  java: '\ue738',
  c: '\ue61e',
  cpp: '\ue61d',
  h: '\ue61e',
  hpp: '\ue61d',
  cs: '\ue648',
  html: '\ue736',
  htm: '\ue736',
  css: '\ue749',
  scss: '\ue749',
  sass: '\ue749',
  less: '\ue749',
  vue: '\ue6a0',
  svelte: '\ue697',
  json: '\ue60b',
  yaml: '\ue6a8',
  yml: '\ue6a8',
  toml: '\ue6b2',
  xml: '\ue619',
  md: '\ue73e',
  mdx: '\ue73e',
  sql: '\ue706',
  sh: '\ue795',
  bash: '\ue795',
  zsh: '\ue795',
  ps1: '\ue70f',
  psm1: '\ue70f',
  lua: '\ue620',
  php: '\ue73d',
  dart: '\ue798',
  png: '\uf1c5',
  jpg: '\uf1c5',
  jpeg: '\uf1c5',
  svg: '\uf1c5',
  webp: '\uf1c5',
  gif: '\uf1c5',
  lock: '\uf023',
  env: '\ue615',
  dockerfile: '\ue7b0',
};

const NERD_NAME_ICONS: Record<string, string> = {
  'package.json': '\ue71e',
  'package-lock.json': '\ue71e',
  'tsconfig.json': '\ue628',
  '.gitignore': '\ue702',
  '.gitattributes': '\ue702',
  '.env': '\ue615',
  dockerfile: '\ue7b0',
  makefile: '\ue615',
  'readme.md': '\ue73e',
  license: '\ue60a',
};

const ASCII_FILE_ICONS: Record<string, string> = {
  ts: '[ts]',
  tsx: '[ts]',
  js: '[js]',
  jsx: '[js]',
  mjs: '[js]',
  cjs: '[js]',
  py: '[py]',
  rs: '[rs]',
  go: '[go]',
  json: '{ }',
  yaml: '{ }',
  yml: '{ }',
  toml: '{ }',
  xml: '< >',
  md: '[md]',
  mdx: '[md]',
  html: '< >',
  htm: '< >',
  css: '{ }',
  sh: '$',
  bash: '$',
  zsh: '$',
  ps1: 'PS',
  psm1: 'PS',
  png: '[img]',
  jpg: '[img]',
  jpeg: '[img]',
  svg: '[img]',
  gif: '[img]',
  webp: '[img]',
  lock: '[lock]',
  env: '[env]',
};

export function getFileIcon(filePath: string, mode: IconMode): string {
  if (filePath.endsWith('/') || filePath.endsWith('\\')) {
    return icon('folder', mode);
  }

  const name = basename(filePath).toLowerCase();
  const ext = extname(name).replace(/^\./, '').toLowerCase();

  if (mode === 'ascii') {
    if (ASCII_FILE_ICONS[ext]) return ASCII_FILE_ICONS[ext];
    return icon('file', mode);
  }

  if (NERD_NAME_ICONS[name]) return NERD_NAME_ICONS[name];
  if (NERD_FILE_ICONS[ext]) return NERD_FILE_ICONS[ext];
  return icon('file', mode);
}

export function getDirIcon(mode: IconMode): string {
  return icon('folder', mode);
}

export function getToolIcon(
  tool:
    | 'read'
    | 'write'
    | 'edit'
    | 'bash'
    | 'powershell'
    | 'search'
    | 'folder'
    | 'file',
  mode: IconMode,
): string {
  return icon(tool, mode);
}
