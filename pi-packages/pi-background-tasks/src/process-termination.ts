import { execFileSync } from "node:child_process";
import { processExists, stopProcessGroup } from "./process.js";

interface ProcessEntry { pid: number; parent: number; group?: number; state?: string }
function snapshot(): ProcessEntry[] {
  if (process.platform === "win32") {
    const json = execFileSync("powershell.exe", ["-WindowStyle", "Hidden", "-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress"],
    { encoding: "utf8", windowsHide: true, timeout: 5000 });
    const values = JSON.parse(json);
    return (Array.isArray(values) ? values : [values]).map((p) => ({ pid: p.ProcessId, parent: p.ParentProcessId }));
  }
  return execFileSync("ps", ["-eo", "pid=,ppid=,pgid=,stat="], { encoding: "utf8", windowsHide: true, timeout: 2000 })
    .trim().split(/\r?\n/).map((line) => {
      const [pid, parent, group, state] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), group: Number(group), state };
    });
}

/** Retain captured descendants/groups across retries, including reparented orphans. */
export function createProcessTreeTerminator(pid: number, pgid?: number): () => Promise<void> {
  const targets = new Set([pid]);
  const groups = new Set<number>();
  return async () => {
    const entries = snapshot();
    const hostGroup = entries.find((entry) => entry.pid === process.pid)?.group;
    if (process.platform !== "win32" && (pgid ?? pid) !== hostGroup) groups.add(pgid ?? pid);
    // A group member can own descendants in other groups, even after its leader exits.
    const capture = (processes: ProcessEntry[]) => {
      for (let changed = true; changed;) {
        changed = false;
        for (const entry of processes) {
          if (!targets.has(entry.pid) && !targets.has(entry.parent) && !(entry.group && groups.has(entry.group))) continue;
          if (!targets.has(entry.pid)) { targets.add(entry.pid); changed = true; }
          if (process.platform !== "win32" && entry.group && entry.group !== hostGroup && !groups.has(entry.group)) {
            groups.add(entry.group); changed = true;
          }
        }
      }
    };
    capture(entries);
    const signal = (value: NodeJS.Signals) => {
      if (process.platform === "win32") {
        // taskkill is synchronous and awaited, including /T descendants; captured orphans are retried below.
        for (const target of targets) if (processExists(target)) stopProcessGroup(target, undefined, value);
        return;
      }
      for (const group of groups) try { process.kill(-group, value); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      for (const target of targets) try { process.kill(target, value); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    const alive = () => {
      if (process.platform === "win32") return [...targets].some(processExists);
      // Zombies have exited and cannot execute; only init/their parent can reap them.
      const processes = snapshot();
      capture(processes); // TERM handlers can fork more work before escalation.
      return processes.some((entry) => !entry.state?.startsWith("Z") && (targets.has(entry.pid) || (entry.group && groups.has(entry.group))));
    };
    const wait = async (ms: number) => {
      const until = Date.now() + ms;
      while (alive()) {
        if (Date.now() >= until) return false;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return true;
    };
    signal("SIGTERM");
    if (await wait(process.platform === "win32" ? 2000 : 500)) return;
    signal("SIGKILL");
    if (!await wait(2000)) throw new Error(`Process tree ${pid} did not terminate after SIGKILL`);
  };
}

/** Do not return until the captured tree and its POSIX groups have terminated. */
export async function terminateProcessTree(pid: number, pgid?: number): Promise<void> {
  await createProcessTreeTerminator(pid, pgid)();
}
