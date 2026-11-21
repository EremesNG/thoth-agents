// AC-1 (agy-upstream-safety-sync): a 5,000-char unknown-tool argument in an
// 80x24 viewport must be inspectable and approval must never happen on unseen
// content. Run: npx vitest run tests/approval-view.test.ts

import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { askUserApproval, isRawArgumentApproval, ScrollableApproval } from "../src/approval-view.js";
import { describeApprovalTarget } from "../src/approval-gate.js";
import { withDialogLock } from "../src/dialog-lock.js";

const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
const ENTER = "\r";
const DOWN = "\x1b[B";
const END = "\x1b[F";
const RIGHT = "\x1b[C";
const BODY = describeApprovalTarget({ tool: "sed_file", arguments: { Path: "/w/a", Body: `HEAD-MARKER ${"x".repeat(5000)} TAIL-MARKER` } });

function mount(rows = 24, columns = 80, body = BODY) {
	const results: boolean[] = [];
	const view = new ScrollableApproval({ terminal: { rows, columns } }, theme, { title: "agy sed_file?", body }, (ok) => results.push(ok));
	return { view, results, text: () => view.render(columns).join("\n") };
}

describe("AC-1 scrollable approval view (80x24)", () => {
	test("render never exceeds the viewport, keeps Yes/No visible, and starts at the head", () => {
		const { view, text } = mount();
		const lines = view.render(80);
		assert.ok(lines.length <= 24, `rendered ${lines.length} rows`);
		for (const l of lines) assert.ok(visibleWidth(l) <= 80, `row too wide: ${l}`);
		assert.match(text(), /HEAD-MARKER/);
		assert.doesNotMatch(text(), /TAIL-MARKER/);
		assert.match(text(), /Yes/);
		assert.match(text(), /\[ No \]/, "default selection is No");
	});

	test("a scroll path reaches the complete tail", () => {
		const { view, text } = mount();
		view.render(80);
		for (let i = 0; i < 200 && !/TAIL-MARKER/.test(text()); i++) view.handleInput(DOWN);
		assert.match(text(), /TAIL-MARKER/);
		const m = mount();
		m.view.render(80);
		m.view.handleInput(END);
		assert.match(m.text(), /TAIL-MARKER/);
		assert.doesNotMatch(m.text(), /end reached/, "End skips the middle rows");
	});

	test("Enter on the default selection denies, even after the tail was reached", () => {
		const a = mount();
		a.view.render(80);
		a.view.handleInput(ENTER);
		assert.deepEqual(a.results, [false]);
		const b = mount();
		b.view.render(80);
		for (let i = 0; i < 200; i++) {
			b.view.handleInput(DOWN);
			b.view.render(80);
		}
		b.view.handleInput(ENTER);
		assert.deepEqual(b.results, [false], "tail seen but Yes never selected");
	});

	test("Yes cannot be selected before the tail has been in view", () => {
		const { view, results, text } = mount();
		view.render(80);
		view.handleInput("y");
		view.handleInput(RIGHT);
		assert.match(text(), /locked/i);
		view.handleInput(ENTER);
		assert.deepEqual(results, [false]);
	});

	test("explicit Yes after scrolling through every row approves", () => {
		const { view, results } = mount();
		view.render(80);
		for (let i = 0; i < 200; i++) {
			view.handleInput(DOWN);
			view.render(80);
		}
		view.handleInput(RIGHT);
		view.handleInput(ENTER);
		assert.deepEqual(results, [true]);
	});

	test("End skipping the middle keeps Yes locked", () => {
		const { view, results, text } = mount();
		view.render(80);
		view.handleInput(END);
		view.render(80);
		assert.match(text(), /locked/i);
		view.handleInput(RIGHT);
		view.handleInput("y");
		view.handleInput(ENTER);
		assert.deepEqual(results, [false]);
	});

	test("End then scrolling back up through the skipped rows unlocks", () => {
		const { view, results } = mount();
		view.render(80);
		view.handleInput(END);
		view.render(80);
		for (let i = 0; i < 200; i++) {
			view.handleInput("\x1b[A");
			view.render(80);
		}
		view.handleInput(RIGHT);
		view.handleInput(ENTER);
		assert.deepEqual(results, [true]);
	});

	test("input without any render cannot unlock Yes", () => {
		const { view, results } = mount();
		for (let i = 0; i < 300; i++) view.handleInput(DOWN);
		view.handleInput(END);
		view.handleInput(RIGHT);
		view.handleInput("y");
		view.handleInput(ENTER);
		assert.deepEqual(results, [false]);
	});

	test("paging with an unrendered final jump leaves the last rows unseen", () => {
		const { view, results } = mount();
		view.render(80);
		for (let i = 0; i < 100; i++) view.handleInput(DOWN); // no renders in between
		view.render(80); // only the final window is seen
		view.handleInput("y");
		view.handleInput(ENTER);
		assert.deepEqual(results, [false]);
	});

	test("resize re-wrap does not grant coverage for unseen rows", () => {
		const { view, results } = mount();
		view.render(80);
		for (let i = 0; i < 200; i++) {
			view.handleInput(DOWN);
			view.render(80);
		}
		// Narrower width re-wraps into rows never shown at that width.
		view.render(40);
		view.handleInput("y");
		view.handleInput(ENTER);
		assert.deepEqual(results, [false]);
	});

	test("full scroll-through at the new width after a resize unlocks", () => {
		const { view, results } = mount();
		view.render(80);
		view.render(40);
		for (let i = 0; i < 400; i++) {
			view.handleInput(DOWN);
			view.render(40);
		}
		view.handleInput("y");
		view.handleInput(ENTER);
		assert.deepEqual(results, [true]);
	});

	test("Esc and n deny; control sequences in arguments are shown inertly", () => {
		for (const key of ["\x1b", "n"]) {
			const { view, results } = mount();
			view.render(80);
			view.handleInput(key);
			assert.deepEqual(results, [false]);
		}
		const evil = mount(24, 80, describeApprovalTarget({ tool: "sed_file", arguments: { value: "a\x1b[2Jb\x07c" } }));
		const plain = evil.text().replace(/\x1b\[[0-9;]*m/g, "");
		assert.doesNotMatch(plain, /[\x1b\x07]/);
		assert.ok(plain.includes(String.raw`a\u001b[2Jb\u0007c`));
	});

	test("short content fits, still defaults to No", () => {
		const { view, results, text } = mount(24, 80, "tiny");
		assert.match(text(), /end reached/);
		view.handleInput(ENTER);
		assert.deepEqual(results, [false]);
	});
});

// Reassemble physical viewport rows by walking down until the bottom clamps.
function readBody(args: Record<string, unknown>): string[] {
	const { view } = mount(24, 80, describeApprovalTarget({ tool: "sed_file", arguments: args }));
	let screen = view.render(80);
	const rows = screen.slice(1, 21);
	for (let i = 0; i < 500; i++) {
		view.handleInput(DOWN);
		const next = view.render(80);
		if (next[21] === screen[21]) break;
		rows.push(next[20]!);
		screen = next;
	}
	assert.match(screen[21]!, /end reached/);
	for (const row of rows) assert.ok(visibleWidth(row) <= 80);
	return rows;
}

test.each([
	["embedded spaces", "a" + " ".repeat(100) + "b", "a" + " ".repeat(200) + "b"],
	["trailing spaces", "tail ", "tail  "],
	["tabs and CR/LF", "a\t\r\nb", "a  \nb"],
	["zero-width marks and bidi overrides", "a\u200b\u202eb", "ab"],
	["literal escape spelling", String.raw`\u202e`, "\u202e"],
	["non-ASCII glyphs and unpaired surrogate", "漢🙂\ud800", "漢🙂�"],
	["long single token", "x".repeat(5000) + "a", "x".repeat(5000) + "b"],
])("80×24 body rows are lossless for %s", (_label, a, b) => {
	const left = readBody({ value: a });
	const right = readBody({ value: b });
	assert.notDeepEqual(left, right);
	for (const [rows, value] of [[left, a], [right, b]] as const) {
		const shown = rows.join("");
		assert.match(shown, /^[\x20-\x7e]+$/u, "only inert visible ASCII is emitted");
		assert.deepEqual(JSON.parse(shown), { tool: "sed_file", arguments: { value } });
	}
});

test("80×24 generated whitespace-heavy arguments do not collide", () => {
	const bodies = new Set<string>();
	for (const count of [0, 1, 2, 79, 80, 100, 200]) {
		for (const separator of [" ", "\t", "\u200b", String.raw`\u0020`]) {
			const args = { [separator]: `prefix${" ".repeat(count)}${separator}suffix`, nested: ["", " "] };
			const rows = readBody(args).join("");
			assert.ok(!bodies.has(rows), "distinct generated arguments must render differently");
			bodies.add(rows);
		}
	}
});

test("escaped whitespace alone can span unseen pages and keep Yes locked", () => {
	const body = describeApprovalTarget({ tool: "sed_file", arguments: { value: " ".repeat(1600) } });
	const { view, results, text } = mount(24, 80, body);
	view.render(80);
	view.handleInput(END);
	assert.match(text(), /Yes locked/);
	view.handleInput("y");
	view.handleInput(ENTER);
	assert.deepEqual(results, [false]);
});

describe("askUserApproval routing", () => {
	const lock = withDialogLock;
	test("raw unknown-tool arguments use the scrollable view, never ui.confirm", async () => {
		let confirmed = 0;
		let customCalls = 0;
		const ui = {
			confirm: async () => { confirmed++; return true; },
			custom: async (factory: (...a: unknown[]) => { render(w: number): string[]; handleInput(d: string): void }, _o?: unknown) => {
				customCalls++;
				return await new Promise<boolean>((resolve) => {
					const comp = factory({ terminal: { rows: 24, columns: 80 }, requestRender() {} }, theme, undefined, resolve);
					comp.render(80);
					comp.handleInput(ENTER);
				});
			},
		};
		const params = { tool: "sed_file", arguments: { a: "x".repeat(5000) } };
		assert.equal(isRawArgumentApproval(params), true);
		assert.equal(await askUserApproval(ui as never, "sed_file", params, describeApprovalTarget(params), 1000, lock), false, "default Enter denies");
		assert.equal(customCalls, 1);
		assert.equal(confirmed, 0);
	});

	test("bash/write/edit targets keep the standard confirm UX unchanged", async () => {
		const seen: unknown[][] = [];
		const ui = { confirm: async (...a: unknown[]) => { seen.push(a); return true; }, custom: async () => { throw new Error("must not be used"); } };
		assert.equal(await askUserApproval(ui as never, "run_command", { command: "ls" }, "ls", 1234, lock), true);
		assert.equal(await askUserApproval(ui as never, "create_file", { path: "/w/a" }, "/w/a", 1234, lock), true);
		assert.deepEqual(seen[0], ["agy run_command?", "ls", { timeout: 1234 }]);
		assert.equal(seen.length, 2);
	});

	test("a failing custom UI denies", async () => {
		const ui = { confirm: async () => true, custom: async () => { throw new Error("boom"); } };
		assert.equal(await askUserApproval(ui as never, "x", { tool: "x", arguments: {} }, "b", 10, lock), false);
	});
});
