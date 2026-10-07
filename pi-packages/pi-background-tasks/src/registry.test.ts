import { readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseDir, ensureTaskDir, taskDir, getRegistryIoMetrics, listActiveMetasForOrigin, inspectMeta, listMetas, listMetasForOrigin, listTaskRecords, logPathFor, metaPathFor, readMeta, resetRegistryIoMetrics, writeMeta } from "./registry.js";
import type { BackgroundTaskMeta } from "./types.js";

vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync), renameSync: vi.fn(fs.renameSync) };
});

describe('atomic metadata writes', () => {
  it('preserves the previous readable record when a write truncates then throws', async () => {
    const meta = fixtureMeta('running', 'previous valid record');
    writeMeta(meta);
    const previous = readMeta(meta.id);
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(writeFileSync).mockImplementationOnce((path, _data, options) => {
      fs.writeFileSync(path, '{"id":', options);
      throw new Error('partial metadata write');
    });

    expect(() => writeMeta({ ...meta, name: 'replacement' })).toThrow('partial metadata write');
    expect(readMeta(meta.id)).toEqual(previous);
    expect(readdirSync(taskDir(meta.id))).toEqual(['meta.json']);
  });

  it.each(['EPERM', 'EBUSY'])('retries a transient Windows %s replacement without removing the target', code => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const meta = fixtureMeta('running', 'before replacement');
    writeMeta(meta);
    vi.mocked(renameSync).mockImplementationOnce(() => {
      expect(readMeta(meta.id)?.name).toBe('before replacement');
      throw Object.assign(new Error('replacement locked'), { code });
    });

    writeMeta({ ...meta, name: 'after replacement' });
    expect(readMeta(meta.id)?.name).toBe('after replacement');
    expect(readdirSync(taskDir(meta.id))).toEqual(['meta.json']);
  });

  it.each(['EIO', 'EPERM', 'EBUSY'])('preserves the last record and removes the temporary file after a persistent %s replacement failure', code => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const meta = fixtureMeta('running', 'previous valid record');
    writeMeta(meta);
    const previous = readMeta(meta.id);
    vi.mocked(renameSync).mockImplementation(() => {
      throw Object.assign(new Error('replacement unavailable'), { code });
    });

    expect(() => writeMeta({ ...meta, name: 'replacement' })).toThrow('replacement unavailable');
    expect(readMeta(meta.id)).toEqual(previous);
    expect(readdirSync(taskDir(meta.id))).toEqual(['meta.json']);
  });
});

describe("registry meta sweep cache", () => {
  it("isolates durable test metadata by Vitest worker pool", () => {
    expect(process.env.VITEST_POOL_ID).toMatch(/^\d+$/);
    expect(baseDir()).toContain(`pi-better-background-tasks-vitest-${process.env.VITEST_POOL_ID}`);
  });

  it("does not re-read terminal metadata on repeated broad sweeps", () => {
    const meta = fixtureMeta("succeeded", "terminal cached");
    ensureTaskDir(meta.id);
    writeFileSync(metaPathFor(meta.id), JSON.stringify(meta, null, 2));

    expect(listMetas().find((candidate) => candidate.id === meta.id)?.name).toBe("terminal cached");

    writeFileSync(metaPathFor(meta.id), JSON.stringify({ ...meta, name: "externally changed" }, null, 2));

    expect(listMetas().find((candidate) => candidate.id === meta.id)?.name).toBe("terminal cached");
    expect(readMeta(meta.id)?.name).toBe("externally changed");
  });

  it("continues re-reading running metadata during broad sweeps", () => {
    const meta = fixtureMeta("running", "running first");
    ensureTaskDir(meta.id);
    writeFileSync(metaPathFor(meta.id), JSON.stringify(meta, null, 2));

    expect(listMetas().find((candidate) => candidate.id === meta.id)?.name).toBe("running first");

    writeFileSync(metaPathFor(meta.id), JSON.stringify({ ...meta, name: "running changed" }, null, 2));

    expect(listMetas().find((candidate) => candidate.id === meta.id)?.name).toBe("running changed");
  });

  it("updates cached terminal metadata through normal writes", () => {
    const meta = fixtureMeta("failed", "terminal written");
    writeMeta(meta);
    writeMeta({ ...meta, dismissedAt: 123 });

    expect(listMetas().find((candidate) => candidate.id === meta.id)?.dismissedAt).toBe(123);
  });
});

// Fixtures share the per-pool registry with other test files; a leaked record
// (especially a corrupt one) changes their list payloads, so remove every one.
const createdIds: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(writeFileSync).mockReset();
  vi.mocked(renameSync).mockReset();
  for (const id of createdIds.splice(0)) rmSync(taskDir(id), { recursive: true, force: true });
});

function fixtureMeta(status: BackgroundTaskMeta["status"], name: string): BackgroundTaskMeta {
  const id = `bg_registry_test_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  createdIds.push(id);
  const now = Date.now();
  return {
    id,
    name,
    kind: "command_watch",
    status,
    startedAt: now,
    endedAt: status === "running" ? undefined : now,
    logPath: logPathFor(id),
    callback: false,
    cwd: process.cwd(),
    spawnPid: process.pid,
  };
}

describe("session-owned registry index", () => {
  it("lists only metadata owned by the requested session", () => {
    const sessionId = `session-a-${process.pid}-${Date.now()}`;
    const ours = fixtureMeta("running", "owned");
    ours.callbackOrigin = { cwd: "/tmp/project", sessionId };
    const foreign = fixtureMeta("running", "foreign");
    foreign.callbackOrigin = { cwd: "/tmp/project", sessionId: "session-b" };
    writeMeta(ours);
    writeMeta(foreign);

    expect(listMetasForOrigin({ cwd: "/tmp/project", sessionId }).map((meta) => meta.id)).toEqual([ours.id]);
  });

  it("refreshes an indexed running record after a normal write", () => {
    const origin = { cwd: "/tmp/project", sessionId: "session-refresh" };
    const meta = fixtureMeta("running", "before");
    meta.callbackOrigin = origin;
    writeMeta(meta);

    expect(listMetasForOrigin(origin)[0]?.name).toBe("before");
    writeMeta({ ...meta, name: "after" });
    expect(listMetasForOrigin(origin)[0]?.name).toBe("after");
  });

  it("serves repeated owned reads entirely from process memory", () => {
    const origin = { cwd: "/tmp/project", sessionId: `session-cache-${process.pid}-${Date.now()}` };
    const meta = fixtureMeta("running", "memory resident");
    meta.callbackOrigin = origin;
    writeMeta(meta);
    expect(listMetasForOrigin(origin)).toHaveLength(1);

    resetRegistryIoMetrics();
    for (let index = 0; index < 100; index += 1) listMetasForOrigin(origin);

    expect(getRegistryIoMetrics()).toEqual({
      fullDirectoryReads: 0,
      indexDirectoryReads: 0,
      metadataFileReads: 0,
      indexRevisionChecks: 100,
    });
  });

  it("moves terminal transitions out of the active owner index", () => {
    const origin = { cwd: "/tmp/project", sessionId: `session-active-${process.pid}-${Date.now()}` };
    const meta = fixtureMeta("running", "active");
    meta.callbackOrigin = origin;
    writeMeta(meta);
    expect(listActiveMetasForOrigin(origin).map((candidate) => candidate.id)).toEqual([meta.id]);

    writeMeta({ ...meta, status: "succeeded", endedAt: Date.now() });
    expect(listActiveMetasForOrigin(origin)).toEqual([]);
    expect(listMetasForOrigin(origin).map((candidate) => candidate.id)).toEqual([meta.id]);
  });
});

describe("legacy shell metadata reload", () => {
  it.each(['win32', 'linux'] as const)('normalizes legacy values before reads and caches on %s', platform => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    try {
      for (const [legacy, expected] of [[false, 'none'], [true, platform === 'win32' ? 'powershell' : 'bash'], [undefined, platform === 'win32' ? 'powershell' : 'bash'], ['bash', 'bash'], ['powershell', 'powershell'], ['none', 'none']] as const) {
        const meta = fixtureMeta('succeeded', 'legacy shell');
        ensureTaskDir(meta.id);
        writeFileSync(metaPathFor(meta.id), JSON.stringify({ ...meta, shell: legacy }));
        expect(readMeta(meta.id)?.shell).toBe(expected);
        expect(listMetas().find(candidate => candidate.id === meta.id)?.shell).toBe(expected);
      }
    } finally { vi.restoreAllMocks(); }
  });
});

describe("metadata inspection", () => {
  it("does not treat invalid metadata as missing", () => {
    const meta = fixtureMeta("running", "broken");
    ensureTaskDir(meta.id);
    writeFileSync(metaPathFor(meta.id), "{broken");
    const inspection = inspectMeta(meta.id);
    expect(inspection.found).toBe(true);
    expect(inspection.readable).toBe(false);
    expect(inspection.meta).toBeUndefined();
    expect(inspection.error).toMatch(/invalid JSON/);
    expect(listTaskRecords().records.some((record) => record.id === meta.id && !record.readable)).toBe(true);
  });
});
