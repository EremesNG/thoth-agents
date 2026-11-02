import { type RenderStatus, resolveStatusGlyph } from './render-kit.js';
import type { WorkPanelSummary } from './work-panel.js';

export interface CompactWorkCountSegment {
  text: string;
  role: 'accent' | 'dim' | 'success' | 'error' | 'muted';
}

export interface CompactWorkCountsOptions {
  kind: 'todos' | 'work' | 'other';
  summary?: WorkPanelSummary;
  /** Override only the queued count's glyph, preserving its role and drop priority. */
  queuedGlyph?: RenderStatus;
  /** Full available width; queued counts require at least 36 columns. */
  width: number;
  /** Cells left for counts after the caller's heading chrome and label. */
  room: number;
  measure(text: string): number;
}

/** Count segments are separated by one unstyled space by the caller. */
export function formatCompactWorkCounts({
  kind,
  summary,
  queuedGlyph = 'queued',
  width,
  room,
  measure,
}: CompactWorkCountsOptions):
  | readonly CompactWorkCountSegment[]
  | string
  | undefined {
  if (!summary) return undefined;
  const { running, queued, completed, failed, cancelled, total } = summary;
  if (
    kind === 'other' ||
    [running, queued, completed, failed, cancelled, total].every(
      (count) => count === undefined,
    )
  )
    return summary.text || undefined;
  const parts = [
    { status: 'running', role: 'accent', count: running ?? 0 },
    { status: 'queued', role: 'dim', count: width >= 36 ? (queued ?? 0) : 0 },
    { status: 'completed', role: 'success', count: completed ?? 0 },
    { status: 'failed', role: 'error', count: failed ?? 0 },
    { status: 'cancelled', role: 'muted', count: cancelled ?? 0 },
  ] as const;
  const kept = parts
    .filter((part) => part.count > 0)
    .map(({ status, role, count }) => ({
      status,
      role,
      text: `${resolveStatusGlyph(status === 'queued' ? queuedGlyph : status)}${count}`,
    }));
  // Preserve running, completed and failed even when those alone exceed the room.
  for (const status of ['cancelled', 'queued']) {
    if (measure(kept.map((part) => part.text).join(' ')) <= room) break;
    const index = kept.findIndex((part) => part.status === status);
    if (index >= 0) kept.splice(index, 1);
  }
  return kept.map(({ text, role }) => ({ text, role }));
}
