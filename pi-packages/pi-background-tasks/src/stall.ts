import { statSync } from "node:fs";

import { observeStall, type StallObservation, type StallThresholds } from "./shared-stall-detector.js";
import type { BackgroundTaskMeta } from "./types.js";

function durationEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

export function backgroundTaskStallThresholds(): Partial<StallThresholds> {
  return {
    quietMs: durationEnv("PI_BETTER_STALL_QUIET_MS"),
    stallMs: durationEnv("PI_BETTER_STALL_MS"),
  };
}

/**
 * Process logs are the only external progress evidence available for detached
 * commands. Watches advance only on changed outcomes, not polls or poll-log writes.
 */
export function backgroundTaskProgressAt(meta: BackgroundTaskMeta): number | undefined {
  // Records predating the progress clock keep their last poll as the initial baseline.
  if (meta.kind === "command_watch") return meta.lastProgressAt ?? meta.lastCheckedAt ?? meta.startedAt;
  const recorded = Math.max(meta.lastProgressAt ?? 0, meta.lastCheckedAt ?? 0, meta.startedAt);
  try {
    return Math.max(recorded, Math.trunc(statSync(meta.logPath).mtimeMs));
  } catch {
    return recorded;
  }
}

export function observeBackgroundTaskStall(meta: BackgroundTaskMeta, now = Date.now()): StallObservation {
  return observeStall({
    now,
    lastProgressAt: backgroundTaskProgressAt(meta),
    startedAt: meta.startedAt,
    exempt: meta.status !== "running",
    thresholds: backgroundTaskStallThresholds(),
  });
}