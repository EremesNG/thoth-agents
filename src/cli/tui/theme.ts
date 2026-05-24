export const theme = {
  accent: 'cyan',
  danger: 'red',
  dim: 'gray',
  ok: 'green',
  title: 'white',
  warning: 'yellow',
} as const;

export function stateColor(
  state: string | undefined,
): 'green' | 'yellow' | 'red' | 'gray' {
  if (state === 'installed') return 'green';
  if (state === 'missing' || state === 'outdated') return 'yellow';
  if (state === 'drift' || state === 'unknown') return 'red';
  return 'gray';
}
