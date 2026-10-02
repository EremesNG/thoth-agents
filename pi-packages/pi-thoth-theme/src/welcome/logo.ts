import type { IconMode } from '../shared/config.ts';

export const THOTH_WORDMARK = 'T H O T H';

export const THOTH_WORDMARK_BOX = [
  '╔╦╗╦ ╦╔═╗╔╦╗╦ ╦',
  ' ║ ╠═╣║ ║ ║ ╠═╣',
  ' ╩ ╩ ╩╚═╝ ╩ ╩ ╩',
] as const;

export const THOTH_LOGO_NERD = [
  '     ▄▄██████▄▄     ',
  '   ▄██▀▀    ▀▀██▄   ',
  '  ███  ▄████▄  ███  ',
  ' ▐██▌ ▐██████▌ ▐██▌ ',
  '  ███  ▀████▀  ███  ',
  '   ▀██▄▄ ▀▀ ▄▄██▀   ',
  '     ▀▀██████▀▀     ',
  '         ██ ▀▄      ',
  '         ██   ▀▄    ',
] as const;

export const THOTH_LOGO_ASCII = [
  '      .-------.     ',
  '     /  .---.  \\    ',
  "   ,-' ( (o) )  `-. ",
  "  <____ `---'  ____>",
  "       `-------'    ",
  '           | \\      ',
  '           |  \\     ',
] as const;

export function getThothLogoLines(mode: IconMode): readonly string[] {
  return mode === 'ascii' ? THOTH_LOGO_ASCII : THOTH_LOGO_NERD;
}
