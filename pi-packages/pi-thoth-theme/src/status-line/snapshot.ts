import type { StatusData } from './layout.ts';
import type { SessionTokenTotals } from './tokens.ts';

/** Shared nonvisual data for the footer and in-place editor decoration. */
export interface StatusSnapshot extends StatusData {
  readonly tokenTotals: SessionTokenTotals;
  /** Runtime-measured main-session output tokens per generation second. */
  readonly tokensPerSecond: number | null;
}

export type StatusSnapshotProvider = () => Readonly<StatusSnapshot>;
