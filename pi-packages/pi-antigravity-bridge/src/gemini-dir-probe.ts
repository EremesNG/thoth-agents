import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAgyCommand } from "./agy-runtime.js";
import { agyVersionVerdict, compareVersionTuples } from "./agy-version.js";
import { terminateProcessTree } from "./process-termination.js";

export const MIN_GEMINI_DIR_VERSION = "1.5.8";
export interface GeminiDirProbe {
 supported: boolean;
 version?: string;
 unverifiedVersion: boolean;
 detail?: "refused" | "timeout" | "spawn-failure";
}
export type StreamHomeMode = "isolated" | "override-skip" | "legacy";
export function resolveStreamHomeMode(input: { engine: string; agentsRootOverride: boolean; probe: GeminiDirProbe | undefined }): StreamHomeMode {
 if (input.engine !== "stream-json") return "legacy";
 if (input.agentsRootOverride) return "override-skip";
 return input.probe?.supported ? "isolated" : "legacy";
}
export interface ProbeGeminiDirOptions { tmpRoot?: string; watchdogMs?: number; env?: Record<string, string> }
const cache = new Map<string, Promise<GeminiDirProbe>>();
/** Read-only parse probe, never an agent turn or installer. */
export function probeGeminiDirFlag(binary = "agy", opts: ProbeGeminiDirOptions = {}): Promise<GeminiDirProbe> {
 const cached = cache.get(binary); if (cached) return cached;
 const run = new Promise<GeminiDirProbe>((resolve) => {
  let tmp: string;
  const unsupported = (detail: GeminiDirProbe["detail"]): GeminiDirProbe => ({ supported: false, unverifiedVersion: false, detail });
  try { tmp = fs.mkdtempSync(path.join(opts.tmpRoot ?? os.tmpdir(), "agy-geminidir-probe-")); }
  catch { resolve(unsupported("spawn-failure")); return; }
  let out = "", err = "", done = false, timedOut = false;
  let watchdog: NodeJS.Timeout | undefined;
  const remove = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } };
  const finish = (code: number | null) => {
   if (done) return; done = true; clearTimeout(watchdog);
   if (timedOut) { resolve(unsupported("timeout")); return; }
   if (code !== 0) { resolve(unsupported(/not defined/.test(err) ? "refused" : "spawn-failure")); return; }
   const check = agyVersionVerdict(out);
   const version = check.status === "development" ? "dev" : check.version;
   resolve({ supported: true, version, unverifiedVersion: !version || version === "dev" || compareVersionTuples(version, MIN_GEMINI_DIR_VERSION) > 0 });
  };
  const env = opts.env ? { ...process.env, ...opts.env } : process.env;
  let proc: ReturnType<typeof spawn>;
  try { proc = spawn(resolveAgyCommand(binary, env), ["--gemini_dir", tmp, "--version"], {
   stdio: ["ignore", "pipe", "pipe"], shell: false, detached: process.platform !== "win32", windowsHide: true, env,
  }); } catch { remove(); finish(-1); return; }
  proc.stdout?.setEncoding("utf8"); proc.stderr?.setEncoding("utf8");
  proc.stdout?.on("data", (d: string) => { out = (out + d).slice(0, 4096); });
  proc.stderr?.on("data", (d: string) => { err = (err + d).slice(0, 4096); });
  proc.on("error", () => finish(-1));
  proc.on("close", (code) => { remove(); finish(code); });
  watchdog = setTimeout(() => { timedOut = true; void terminateProcessTree(proc).then(() => finish(null)); }, opts.watchdogMs ?? 5000);
 });
 cache.set(binary, run); return run;
}
export function resetGeminiDirProbeCache(): void { cache.clear(); }
