import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pageRetainedFile, pageVerbatimText } from "./shared-log-utils.js";
import { emptyFailureState, pageFailureIncidents, reduceFailure } from "./shared-failure-observations.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function file(text: string): string {
  const directory = mkdtempSync(join(tmpdir(), "bg-cursor-"));
  directories.push(directory);
  const path = join(directory, "output.log");
  writeFileSync(path, text);
  return path;
}

function payload(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor.slice(3), "base64url").toString("utf8"));
}

function rewrite(cursor: string, edit: (value: Record<string, unknown>) => void): string {
  const value = payload(cursor);
  edit(value);
  return cursor.slice(0, 3) + Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Exactly one copied base64url character changes, and only the requested field changes. */
function miscopy(cursor: string, field: string, accept: (value: unknown) => boolean = () => true): string {
  const original = payload(cursor);
  const { [field]: before, ...rest } = original;
  for (let index = 3; index < cursor.length; index += 1) {
    for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") {
      if (character === cursor[index]) continue;
      const candidate = cursor.slice(0, index) + character + cursor.slice(index + 1);
      try {
        const { [field]: after, ...remaining } = payload(candidate);
        if (typeof after === typeof before && after !== before && accept(after) && JSON.stringify(remaining) === JSON.stringify(rest)) return candidate;
      } catch { /* A malformed copy is not the parseable near-miss under test. */ }
    }
  }
  throw new Error(`No one-character miscopy of ${field}`);
}

function incidents() {
  let state = emptyFailureState();
  for (let index = 0; index < 12; index += 1) {
    state = reduceFailure(state, { id: `incident-${index}`, operation: `op-${index}`, kind: "failure", category: "exit", summary: `failure-${index}` }, index);
  }
  return state;
}

const text = "line-000\nline-001\nline-002\nline-003\n";

describe("caller-owned cursor integrity", () => {
  it("continues text after a one-character source digest miscopy without claiming replacement", () => {
    const first = pageVerbatimText(text, { maxBytes: 9 });
    const next = pageVerbatimText(text, { cursor: miscopy(first.nextCursor, "v"), maxBytes: 9 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.startByte).toBe(9);
    expect(next.text).toBe("line-001\n");
  });

  it.each(["x", "w"])("continues text when only its %s witness/tag is miscopied", (field) => {
    const first = pageVerbatimText(text, { maxBytes: 9 });
    const next = pageVerbatimText(text, { cursor: miscopy(first.nextCursor, field), maxBytes: 9 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.text).toBe("line-001\n");
  });

  it("never trusts a damaged text offset, including an offset moved to the end", () => {
    const first = pageVerbatimText(text, { maxBytes: 9 });
    for (const cursor of [miscopy(first.nextCursor, "o"), rewrite(first.nextCursor, (value) => { value.o = value.n; })]) {
      const next = pageVerbatimText(text, { cursor, maxBytes: 9 });
      expect(next.reset).toBe("cursor-corrupt");
      expect(next.text).toBe("line-000\n");
      expect(next.hasMore).toBe(true);
    }
  });

  it("rejects legacy text positions and distinguishes genuine replacement from corruption", () => {
    const first = pageVerbatimText(text, { maxBytes: 9 });
    const legacy = rewrite(first.nextCursor, (value) => { delete value.x; delete value.w; value.v = first.revision; });
    for (const source of [text, text.replace("000", "NEW")]) {
      const next = pageVerbatimText(source, { cursor: legacy, maxBytes: 9 });
      expect(next.reset).toBe("cursor-corrupt");
      expect(next.startByte).toBe(0);
    }
    const replaced = pageVerbatimText(text.replace("000", "NEW"), { cursor: first.nextCursor, maxBytes: 9 });
    expect(replaced.reset).toBe("source-replaced");
    expect(replaced.text).toBe("line-NEW\n");
    const damaged = pageVerbatimText(`prefix\n${text}`, { cursor: miscopy(first.nextCursor, "x"), maxBytes: 9 });
    expect(damaged.reset).toBe("cursor-corrupt");
    expect(damaged.startByte).toBe(0);
  });

  it("reports a miscopied file identity as corruption, not source replacement", () => {
    const path = file(text);
    const first = pageRetainedFile(path, { maxBytes: 9 });
    const next = pageRetainedFile(path, { cursor: miscopy(first.nextCursor, "i"), maxBytes: 9 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.startByte).toBe(0);
  });

  it("never skips repeated file bytes when a single-character offset miscopy has the same byte window", () => {
    const path = file("a".repeat(1000));
    const first = pageRetainedFile(path, { maxBytes: 300 });
    const cursor = miscopy(first.nextCursor, "o", (value) => Number(value) > 300 && Number(value) < 1000);
    const next = pageRetainedFile(path, { cursor, maxBytes: 100 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.startByte).toBe(0);
    expect(next.hasMore).toBe(true);
  });

  it("resumes a checksum-only file miscopy but rejects untagged legacy offsets", () => {
    const path = file(text);
    const first = pageRetainedFile(path, { maxBytes: 9 });
    const damaged = pageRetainedFile(path, { cursor: miscopy(first.nextCursor, "x"), maxBytes: 9 });
    expect(damaged.reset).toBe("cursor-corrupt");
    expect(damaged.text).toBe("line-001\n");
    const legacy = rewrite(first.nextCursor, (value) => { delete value.x; });
    const rejected = pageRetainedFile(path, { cursor: legacy, maxBytes: 9 });
    expect(rejected.reset).toBe("cursor-corrupt");
    expect(rejected.startByte).toBe(0);
  });

  it("keeps corruption explicit even if the retained file becomes unreadable", () => {
    const path = file(text);
    const first = pageRetainedFile(path, { maxBytes: 9 });
    const cursor = miscopy(first.nextCursor, "x");
    rmSync(path);
    const next = pageRetainedFile(path, { cursor, maxBytes: 9 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "read" })]));
  });

  it("restarts at the oldest retained byte after compaction and preserves the loss disclosure", () => {
    const path = file(text);
    const first = pageRetainedFile(path, { maxBytes: 9, generation: 0 });
    writeFileSync(path, "retained-first\nretained-last\n");
    const options = { maxBytes: 15, generation: 1, discardedBytes: 900 };
    const compacted = pageRetainedFile(path, { ...options, cursor: first.nextCursor });
    expect(compacted.reset).toBe("compacted");
    expect(compacted.startByte).toBe(0);
    expect(compacted.text).toBe("retained-first\n");
    expect(compacted.gaps).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "retention", bytes: 900 })]));
    const damaged = pageRetainedFile(path, { ...options, cursor: miscopy(first.nextCursor, "x") });
    expect(damaged.reset).toBe("cursor-corrupt");
    expect(damaged.startByte).toBe(0);
    const replacement = pageRetainedFile(path, { cursor: first.nextCursor, maxBytes: 15, generation: 0 });
    expect(replacement.reset).toBe("source-replaced");
  });

  it("continues incident rows after a one-character source miscopy instead of replaying the first row", () => {
    const state = incidents();
    const first = pageFailureIncidents(state, { maxBytes: 80 });
    const expected = pageFailureIncidents(state, { cursor: first.nextCursor, maxBytes: 80 });
    const next = pageFailureIncidents(state, { cursor: miscopy(first.nextCursor, "v"), maxBytes: 80 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.text).toBe(expected.text);
    expect(next.text).not.toBe(first.text);
  });

  it.each(["q", "w"])("continues incidents when only %s is miscopied", (field) => {
    const state = incidents();
    const first = pageFailureIncidents(state, { maxBytes: 80 });
    const next = pageFailureIncidents(state, { cursor: miscopy(first.nextCursor, field), maxBytes: 80 });
    expect(next.reset).toBe("cursor-corrupt");
    expect(next.text).toContain("failure-10");
    expect(next.text).not.toContain("failure-11");
  });

  it("does not skip incidents after row or intra-row byte offsets are damaged", () => {
    const state = incidents();
    const first = pageFailureIncidents(state, { maxBytes: 80 });
    const partial = pageFailureIncidents(state, { maxBytes: 16 });
    for (const cursor of [miscopy(first.nextCursor, "o"), miscopy(partial.nextCursor, "b"), rewrite(first.nextCursor, (value) => { value.o = value.n; })]) {
      const next = pageFailureIncidents(state, { cursor, maxBytes: 80 });
      expect(next.reset).toBe("cursor-corrupt");
      expect(next.text).toContain("failure-11");
      expect(next.hasMore).toBe(true);
    }
  });

  it("rejects legacy incident cursors and reports inserted rows as replacement, even with a damaged tag", () => {
    const state = incidents();
    const first = pageFailureIncidents(state, { maxBytes: 80 });
    const legacy = "i1." + Buffer.from(JSON.stringify({ k: "i", x: 2, o: 1, v: "legacy-revision", n: 12 })).toString("base64url");
    const stale = pageFailureIncidents(state, { cursor: legacy, maxBytes: 80 });
    expect(stale.reset).toBe("stale-cursor");
    expect(stale.text).toContain("failure-11");
    const changed = reduceFailure(state, { id: "inserted", operation: "new", kind: "failure", summary: "new-first-failure" }, 20);
    const replaced = pageFailureIncidents(changed, { cursor: first.nextCursor, maxBytes: 80 });
    expect(replaced.reset).toBe("source-replaced");
    expect(replaced.text).toContain("new-first-failure");
    const corrupt = pageFailureIncidents(changed, { cursor: miscopy(first.nextCursor, "q"), maxBytes: 80 });
    expect(corrupt.reset).toBe("cursor-corrupt");
    expect(corrupt.text).toContain("new-first-failure");
  });

  it("invalidates incident position witnesses when rendered disposition text changes", () => {
    const state = incidents();
    const first = pageFailureIncidents(state, { maxBytes: 80 });
    const changed = reduceFailure(state, { id: "opened", operation: "op-11", kind: "disposition", disposition: "open", incidents: ["incident-11"], reason: "new disposition" }, 30);
    const replaced = pageFailureIncidents(changed, { cursor: first.nextCursor, maxBytes: 120 });
    expect(replaced.reset).toBe("source-replaced");
    expect(replaced.text).toContain("new disposition");
    const corrupt = pageFailureIncidents(changed, { cursor: miscopy(first.nextCursor, "q"), maxBytes: 120 });
    expect(corrupt.reset).toBe("cursor-corrupt");
    expect(corrupt.text).toContain("new disposition");
  });
});
