import { execFileSync } from "node:child_process";
import { processExists, stopProcessGroup } from "./process.js";

interface ProcessEntry { pid: number; parent: number; group?: number; state?: string; started?: string }
function snapshot(): ProcessEntry[] {
  if (process.platform === "win32") {
    const json = execFileSync("powershell.exe", ["-WindowStyle", "Hidden", "-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress"],
    { encoding: "utf8", windowsHide: true, timeout: 5000 });
    const values = JSON.parse(json);
    return (Array.isArray(values) ? values : values ? [values] : []).map((p) => ({
      pid: p.ProcessId, parent: p.ParentProcessId, started: p.CreationDate == null ? undefined : String(p.CreationDate),
    }));
  }
  return execFileSync("ps", ["-eo", "pid=,ppid=,pgid=,stat=,lstart="], { encoding: "utf8", windowsHide: true, timeout: 2000 })
    .trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const [pid, parent, group, state, ...started] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), group: Number(group), state, started: started.join(" ") || undefined };
    });
}

/** Capture while the leader lives; retain identities/groups through exit, retries and reload. */
export function createProcessTreeTerminator(pid: number, pgid?: number): () => Promise<void> {
  const targets = new Map<number, string | undefined>([[pid, undefined]]);
  const groups = new Set<number>();
  let verified = false;
  const matches = (entry: ProcessEntry) => targets.has(entry.pid) &&
    (!targets.get(entry.pid) || !entry.started || targets.get(entry.pid) === entry.started);
  const capture = (entries: ProcessEntry[]) => {
    const hostGroup = entries.find((entry) => entry.pid === process.pid)?.group;
    if (process.platform !== "win32" && (pgid ?? pid) !== hostGroup) groups.add(pgid ?? pid);
    const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
    for (let changed = true; changed;) {
      changed = false;
      for (const entry of entries) {
        // A reused PID is not the captured process, nor a source of new descendants.
        if (targets.has(entry.pid) && !matches(entry)) continue;
        const parent = byPid.get(entry.parent);
        const ownedParent = targets.has(entry.parent) && (!parent || matches(parent));
        if (!matches(entry) && !ownedParent && !(entry.group && groups.has(entry.group))) continue;
        if (!targets.has(entry.pid)) { targets.set(entry.pid, entry.started); changed = true; }
        else if (!targets.get(entry.pid) && entry.started) targets.set(entry.pid, entry.started);
        if (process.platform !== "win32" && entry.group && entry.group !== hostGroup && !groups.has(entry.group)) {
          groups.add(entry.group); changed = true;
        }
      }
    }
  };
  // Capture errors are not success. Settlement takes a fresh, mandatory snapshot and can retry.
  const observe = () => { try { capture(snapshot()); } catch { /* retained for settlement */ } };
  observe();
  const tracker = setInterval(observe, process.platform === "win32" ? 1000 : 100);
  tracker.unref();
  return async () => {
    if (verified) return;
    const entries = snapshot();
    capture(entries);
    const signal = (value: NodeJS.Signals, processes = snapshot()) => {
      capture(processes);
      const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
      if (process.platform === "win32") {
        // Await taskkill, then independently verify captured orphans by PID + creation time.
        for (const target of targets.keys()) {
          const entry = byPid.get(target);
          if ((!entry || matches(entry)) && processExists(target)) stopProcessGroup(target, undefined, value);
        }
        return;
      }
      for (const group of groups) try { process.kill(-group, value); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      for (const target of targets.keys()) {
        const entry = byPid.get(target);
        if (entry && !matches(entry)) continue;
        try { process.kill(target, value); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    };
    const alive = (processes = snapshot()) => {
      capture(processes); // TERM handlers can fork more work before escalation.
      if (process.platform === "win32") {
        const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
        return [...targets.keys()].some((target) => {
          const entry = byPid.get(target);
          return (!entry || matches(entry)) && processExists(target);
        });
      }
      // Zombies have exited and cannot execute; only init/their parent can reap them.
      return processes.some((entry) => !entry.state?.startsWith("Z") &&
        (matches(entry) || (entry.group && groups.has(entry.group))));
    };
    const wait = async (ms: number) => {
      const until = Date.now() + ms;
      while (alive()) {
        if (Date.now() >= until) return false;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return true;
    };
    // The mandatory settlement census can prove an empty tree immediately;
    // do not launch kill helpers or repeat expensive censuses in that case.
    if (!alive(entries)) {
      verified = true;
      clearInterval(tracker);
      return;
    }
    signal("SIGTERM", entries);
    if (!await wait(process.platform === "win32" ? 2000 : 500)) {
      signal("SIGKILL");
      if (!await wait(2000)) throw new Error(`Process tree ${pid} did not terminate after SIGKILL`);
    }
    verified = true;
    clearInterval(tracker);
  };
}

/** Do not return until the captured tree and its POSIX groups have terminated. */
export async function terminateProcessTree(pid: number, pgid?: number): Promise<void> {
  await createProcessTreeTerminator(pid, pgid)();
}
