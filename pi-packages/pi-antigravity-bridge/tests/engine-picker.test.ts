// Engine picker predicates, copy/order and SDK-backed overlay teardown.

import { beforeAll, expect, test, vi } from "vitest";
import { initTheme } from '@earendil-works/pi-coding-agent';
import { settleOwnedOverlays } from '@thoth-agents/pi-core';
import { ownedOverlaySession } from '../../pi-core/test/owned-overlay-fixture.js';
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	agyMissingMessage,
	ENGINE_PICKER_ITEMS,
	ENGINE_PICKER_INTRO,
	isAgyInstalled,
	savedEngineMessage,
	shouldOfferEnginePicker,
	showEnginePicker,
	toEngine,
} from "../src/engine-picker.js";

beforeAll(() => initTheme('dark', false));

test('picker: reload settles once with undefined and restores editor focus', async () => {
  vi.useFakeTimers();
  const app = ownedOverlaySession();
  try {
    const result = showEnginePicker(app.ctx.ui);
    const settled = vi.fn();
    void result.then(settled);
    await Promise.resolve();
    expect(app.tui.hasOverlay()).toBe(true);
    settleOwnedOverlays(app.ctx);
    await vi.waitFor(() => expect(settled).toHaveBeenCalledExactlyOnceWith(undefined));
    settleOwnedOverlays(app.ctx);
    await expect(result).resolves.toBeUndefined();
    expect(app.completions).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(app.tui.hasOverlay()).toBe(false);
    expect(app.tui.getFocusedComponent()).toBe(app.editor);
  } finally {
    app.tui.stop();
    vi.useRealTimers();
  }
});

function tmpConfig(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agy-picker-")), "config.json");
}

test("picker: first run (no config file, no env) offers the picker", () => {
	const p = tmpConfig();
	try {
		assert.equal(shouldOfferEnginePicker(p, {}), true);
	} finally {
		fs.rmSync(path.dirname(p), { recursive: true, force: true });
	}
});

test("picker: existing config file suppresses the picker", () => {
	const p = tmpConfig();
	try {
		fs.writeFileSync(p, "{}\n");
		assert.equal(shouldOfferEnginePicker(p, {}), false);
	} finally {
		fs.rmSync(path.dirname(p), { recursive: true, force: true });
	}
});

test("picker: AGY_ENGINE env suppresses the picker even on a fresh install", () => {
	const p = tmpConfig();
	try {
		assert.equal(shouldOfferEnginePicker(p, { AGY_ENGINE: "acp" }), false);
		assert.equal(shouldOfferEnginePicker(p, { AGY_ENGINE: "" }), false);
	} finally {
		fs.rmSync(path.dirname(p), { recursive: true, force: true });
	}
});

test("picker: acp is the first (default preselected) option", () => {
	assert.equal(ENGINE_PICKER_ITEMS.length, 2);
	assert.equal(ENGINE_PICKER_ITEMS[0]?.value, "acp");
	assert.equal(ENGINE_PICKER_ITEMS[1]?.value, "stream-json");
});

test("picker: only the literal stream-json value selects the stream-json engine; unknown values fall back to acp", () => {
	assert.equal(toEngine("acp"), "acp");
	assert.equal(toEngine("stream-json"), "stream-json");
	assert.equal(toEngine("stream-json "), "acp");
	assert.equal(toEngine("sqlite"), "acp");
});

test("picker: saved-engine message describes shared native CLI setup", () => {
 assert.match(savedEngineMessage("stream-json"), /Restart pi to apply/);
 const acp = savedEngineMessage("acp");
 assert.match(acp, /agy >= 1\.5\.3/);
 assert.match(acp, /shares its Google sign-in/);
 assert.match(acp, /Restart pi to apply/);
 assert.doesNotMatch(acp, /download|second sign-in/);
});

test("picker: agy binary detection covers PATH and explicit paths", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-bin-"));
	try {
		const fake = path.join(dir, "agy");
		fs.writeFileSync(fake, "#!/bin/sh\n");
		fs.chmodSync(fake, 0o755);
		assert.equal(isAgyInstalled("agy", { PATH: [dir, "/usr/bin"].join(path.delimiter) }, "linux"), true);
		assert.equal(isAgyInstalled("agy", { PATH: "/usr/bin" }), false);
		assert.equal(isAgyInstalled("agy", { PATH: "" }), false);
		assert.equal(isAgyInstalled(fake, { PATH: "" }), true);
		assert.equal(isAgyInstalled(path.join(dir, "nope"), {}), false);
		assert.equal(isAgyInstalled(dir, { PATH: "" }), false); // a dir is not a file
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("picker: missing-agy toast carries the official install URL", () => {
	assert.match(agyMissingMessage(), /https:\/\/antigravity\.google\/product\/antigravity-cli/);
	assert.match(agyMissingMessage(), /[Ll]og in/);
});

test("picker: win32 bare names probe spawnable suffixes (issue #11)", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-bin-win-"));
	try {
		// Suffix case matches the host fs; the point is OUR probe logic, not
		// NTFS case-insensitivity.
		fs.writeFileSync(path.join(dir, "agy.EXE"), "");
		fs.writeFileSync(path.join(dir, "agy2.EXE"), "");
		fs.writeFileSync(path.join(dir, "agy3.COM"), "");
		fs.writeFileSync(path.join(dir, "agy4"), "");
		assert.equal(isAgyInstalled("agy", { PATH: dir }, "win32"), true);
		assert.equal(isAgyInstalled("agy2", { PATH: dir }, "win32"), true);
		// Google ships only agy.exe on Windows; nothing else is probed.
		assert.equal(isAgyInstalled("agy3", { PATH: dir }, "win32"), false);
		// A bare AGY_BIN=agy.exe already carries the extension.
		fs.writeFileSync(path.join(dir, "agy7.exe"), "");
		assert.equal(isAgyInstalled("agy7.exe", { PATH: dir }, "win32"), true);
		// .cmd shims count as NOT installed: spawns run shell:false and Node
		// throws EINVAL on .bat/.cmd since CVE-2024-27980.
		fs.writeFileSync(path.join(dir, "agy5.CMD"), "");
		assert.equal(isAgyInstalled("agy5", { PATH: dir }, "win32"), false);
		// Extensionless files cannot be spawned on win32 either.
		assert.equal(isAgyInstalled("agy4", { PATH: dir }, "win32"), false);
		// Real machines export PATHEXT; it must not widen the probe.
		assert.equal(isAgyInstalled("agy5", { PATH: dir, PATHEXT: ".CMD;.EXE" }, "win32"), false);
		fs.rmSync(path.join(dir, "agy.EXE"));
		fs.mkdirSync(path.join(dir, "agy.EXE"));
		assert.equal(isAgyInstalled("agy", { PATH: dir }, "win32"), false); // dir is not a file
		// No suffix probing off win32, even when a .exe exists.
		assert.equal(isAgyInstalled("agy2", { PATH: dir }, "linux"), false);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("picker: backslash binRef routes to explicit-file lookup on win32", () => {
 const stat = vi.spyOn(fs, "statSync").mockImplementation((file) => {
  if (String(file) === "C:\\agy.exe") return { isFile: () => true } as fs.Stats;
  throw new Error("missing");
 });
 try { assert.equal(isAgyInstalled("C:\\agy.exe", { PATH: "ignored" }, "win32"), true);
 assert.equal(isAgyInstalled("C:\\nope\\agy.exe", { PATH: "ignored" }, "win32"), false); }
 finally { stat.mockRestore(); }
});

test("picker: intro explains both engines' constraints", () => {
	assert.match(ENGINE_PICKER_INTRO, /agy` CLI/);
	assert.match(ENGINE_PICKER_INTRO, /authenticated/);
	assert.match(ENGINE_PICKER_INTRO, /native `agy acp`/);
	assert.match(ENGINE_PICKER_INTRO, /Shares the CLI installation and Google credentials/);
	assert.match(ENGINE_PICKER_INTRO, /1\.5\.3/);
	assert.match(ENGINE_PICKER_INTRO, /\/agy engine/);
	// Tool-result images ride BOTH engines since the gate widening
	// (probe-verified 2026-09-07); the old "adds image input" claim painted
	// an ACP advantage that no longer exists. Keep it out.
	assert.doesNotMatch(ENGINE_PICKER_INTRO, /[Aa]dds image/);
});
