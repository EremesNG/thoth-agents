export type EffortSelection =
  | { kind: 'inherit' }
  | { kind: 'effort'; value: string };

export function normalizeEffortSelection(
  value: string | null | undefined,
): EffortSelection {
  const normalized = value?.trim() ?? '';
  if (!normalized || normalized === 'inherit' || normalized === 'default') {
    return { kind: 'inherit' };
  }
  return { kind: 'effort', value: normalized };
}

export function isExplicitEffort(
  selection: EffortSelection,
): selection is { kind: 'effort'; value: string } {
  return selection.kind === 'effort';
}
