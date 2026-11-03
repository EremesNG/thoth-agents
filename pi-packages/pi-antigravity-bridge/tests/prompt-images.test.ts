import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test, vi } from "vitest";
import { STAGE_DIR_PREFIX, STAGE_MAX_AGE_MS, buildImageNote, stagePromptImages } from "../src/prompt-images.js";

const PNG = { data: Buffer.from("png-pixels").toString("base64"), mimeType: "image/png" };
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-image-test-")); });
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	fs.rmSync(root, { recursive: true, force: true });
});

test("stages decoded pixels in fresh temp directories with MIME-derived safe names and owner-only files", () => {
	const write = vi.spyOn(fs, "writeFileSync");
	const images = [PNG, ...["image/jpeg", "image/gif", "image/webp", "image/bmp", "../../unknown"].map(mimeType => ({ ...PNG, mimeType }))];
	const first = stagePromptImages(images, root);
	const second = stagePromptImages([PNG], root);
	assert.ok(first);
	assert.ok(second);
	assert.notEqual(first.dir, second.dir);
	assert.equal(path.dirname(first.dir), root);
	assert.ok(path.basename(first.dir).startsWith(STAGE_DIR_PREFIX));
	assert.deepEqual(first.paths.map(file => path.basename(file)), ["image-1.png", "image-2.jpg", "image-3.gif", "image-4.webp", "image-5.bmp", "image-6.bin"]);
	for (const file of first.paths) {
		assert.equal(path.dirname(file), first.dir);
		assert.equal(fs.readFileSync(file, "utf8"), "png-pixels");
		assert.equal((write.mock.calls.find(call => call[0] === file)?.[2] as { mode: number }).mode, 0o600);
		if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	}
	const note = buildImageNote(first.paths);
	for (const file of first.paths) assert.ok(note.includes(file));
	assert.match(note, /pi read tool/i);
});

test.each(["__proto__", "toString"])("inherited object keys are unknown MIME types (%s)", mimeType => {
	const staged = stagePromptImages([{ ...PNG, mimeType }], root);
	assert.ok(staged);
	assert.equal(path.basename(staged.paths[0]), "image-1.bin");
});

test.each(["", "!!!"])("rejects a zero-byte decoded payload (%j) and removes a partially written directory", data => {
	assert.equal(stagePromptImages([PNG, { ...PNG, data }], root), null);
	assert.deepEqual(fs.readdirSync(root), []);
});

test("cleans partial files on a write failure and fails safely for an unusable root", () => {
	const write = fs.writeFileSync;
	vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...args) => {
		if (String(file).endsWith("image-2.png")) throw new Error("disk full");
		return write(file, ...args);
	});
	assert.equal(stagePromptImages([PNG, PNG], root), null);
	assert.deepEqual(fs.readdirSync(root), []);
	const notADir = path.join(root, "file");
	write(notADir, "x");
	assert.equal(stagePromptImages([PNG], notADir), null);
	assert.equal(stagePromptImages([PNG], path.join(root, "missing")), null);
});

test("opportunistic sweep uses the 24h mtime cutoff and ignores foreign dirs, files, symlinks and nested symlink targets", () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
	const makeDir = (name: string, age: number) => {
		const dir = path.join(root, name);
		fs.mkdirSync(dir);
		const time = new Date(Date.now() - age);
		fs.utimesSync(dir, time, time);
		return dir;
	};
	const stale = makeDir(`${STAGE_DIR_PREFIX}old`, STAGE_MAX_AGE_MS + 60_000);
	const fresh = makeDir(`${STAGE_DIR_PREFIX}fresh`, 60_000);
	const boundary = makeDir(`${STAGE_DIR_PREFIX}boundary`, STAGE_MAX_AGE_MS);
	const foreign = makeDir("foreign", STAGE_MAX_AGE_MS * 2);
	const prefixedFile = path.join(root, `${STAGE_DIR_PREFIX}file`);
	fs.writeFileSync(prefixedFile, "keep");
	fs.utimesSync(prefixedFile, new Date(0), new Date(0));
	const outside = makeDir("outside", STAGE_MAX_AGE_MS * 2);
	const marker = path.join(outside, "pixels");
	fs.writeFileSync(marker, "keep outside");
	const link = path.join(root, `${STAGE_DIR_PREFIX}link`);
	// Junctions don't require Windows developer mode or elevated privileges.
	fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
	fs.symlinkSync(outside, path.join(stale, "nested"), process.platform === "win32" ? "junction" : "dir");
	fs.utimesSync(stale, new Date(0), new Date(0));
	assert.ok(stagePromptImages([PNG], root));
	assert.equal(fs.existsSync(stale), false);
	for (const kept of [fresh, boundary, foreign, prefixedFile, link]) assert.equal(fs.existsSync(kept), true, kept);
	assert.equal(fs.readFileSync(marker, "utf8"), "keep outside");
});
