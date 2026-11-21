// Scrollable approval view for agy native calls whose arguments are shown raw
// (unknown-target approvals). A plain confirm renders the whole body inline;
// in a bounded terminal the tail and the Yes/No row can be clipped while Enter
// still approves. This component bounds its own height to the viewport, offers
// a scroll path to the tail, and fails closed: the selection starts on No, Yes
// can only be selected after every body row has been in view, Enter confirms
// the current selection, and Esc / timeout / any error deny.

import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

/** Rows the chrome occupies: title, scroll indicator, options, hint. */
const CHROME_ROWS = 4;

export interface ApprovalViewHost {
	/** Current terminal size; read on every render so resizes apply. */
	terminal: { rows: number; columns?: number };
	requestRender?: () => void;
}

export interface ApprovalViewTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface ScrollableApprovalOptions {
	title: string;
	/** Inert printable-ASCII escaped JSON from describeApprovalTarget. */
	body: string;
	timeoutMs?: number;
}

export class ScrollableApproval {
	#top = 0;
	#yes = false;
	/** Body rows actually rendered in view at the current wrap width. */
	#seen = new Set<number>();
	#seenWidth = -1;
	#settled = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#lastBodyRows = 1;
	#notice = "";
	#lines: string[] = [];
	#linesWidth = -1;

	constructor(
		private readonly host: ApprovalViewHost,
		private readonly theme: ApprovalViewTheme,
		private readonly options: ScrollableApprovalOptions,
		private readonly done: (approved: boolean) => void,
	) {
		if (options.timeoutMs && options.timeoutMs > 0) {
			this.#timer = setTimeout(() => this.#settle(false), options.timeoutMs);
			this.#timer.unref?.();
		}
	}

	#settle(approved: boolean): void {
		if (this.#settled) return;
		this.#settled = true;
		if (this.#timer) clearTimeout(this.#timer);
		this.done(approved);
	}

	dispose(): void {
		this.#settle(false);
	}

	invalidate(): void {
		this.#linesWidth = -1;
	}

	#wrapped(width: number): string[] {
		if (this.#linesWidth !== width) {
			const out: string[] = [];
			const { body } = this.options;
			if (/[^ -~]/u.test(body)) throw new Error("Unsafe approval body");
			// Each ASCII character occupies one cell. Slice without dropping,
			// inserting or reordering anything, including across escape sequences.
			for (let i = 0; i < body.length; i += width) out.push(body.slice(i, i + width));
			this.#lines = out;
			this.#linesWidth = width;
			// Re-wrapping at a new width yields different rows: prior coverage
			// grants nothing for them.
			if (this.#seenWidth !== width) {
				this.#seen = new Set();
				this.#seenWidth = width;
			}
		}
		return this.#lines;
	}

	/** True only once every body row has been rendered in view. */
	#fullySeen(): boolean {
		return this.#seenWidth >= 0 && this.#seen.size >= this.#lines.length;
	}

	#maxTop(total: number): number {
		return Math.max(0, total - this.#lastBodyRows);
	}

	#scroll(delta: number, total: number): void {
		this.#top = Math.min(this.#maxTop(total), Math.max(0, this.#top + delta));
		this.host.requestRender?.();
	}

	render(width: number): string[] {
		const w = Math.max(10, width);
		const rows = Math.max(CHROME_ROWS + 1, this.host.terminal.rows);
		const bodyRows = rows - CHROME_ROWS;
		this.#lastBodyRows = bodyRows;
		const lines = this.#wrapped(w - 1);
		this.#top = Math.min(this.#top, this.#maxTop(lines.length));
		const visible = lines.slice(this.#top, this.#top + bodyRows);
		for (let i = this.#top; i < this.#top + visible.length; i++) this.#seen.add(i);
		const fit = (text: string): string => truncateToWidth(text, w, "…");
		const out: string[] = [fit(this.theme.fg("accent", this.theme.bold(this.options.title)))];
		out.push(...visible);
		while (out.length < 1 + bodyRows) out.push("");
		const first = Math.min(lines.length, this.#top + 1);
		const last = Math.min(lines.length, this.#top + bodyRows);
		out.push(fit(this.theme.fg("muted", this.#fullySeen() ? `lines ${first}-${last} of ${lines.length} (end reached)` : `lines ${first}-${last} of ${lines.length} - view all rows to enable Yes (↓ PgDn End)`)));
		const yes = this.#fullySeen() ? (this.#yes ? "[ Yes ]" : "  Yes  ") : "  (Yes locked)  ";
		const no = this.#yes ? "  No  " : "[ No ]";
		out.push(fit(`${yes}   ${no}`));
		out.push(fit(this.theme.fg("dim", this.#notice || "↑↓ PgUp PgDn Home End scroll · ←/→ choose · Enter confirm (default No) · Esc deny")));
		return out;
	}

	handleInput(data: string): void {
		if (this.#settled) return;
		const total = this.#lines.length;
		const page = Math.max(1, this.#lastBodyRows - 1);
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "n" || data === "N") return this.#settle(false);
		if (matchesKey(data, "enter") || matchesKey(data, "return")) return this.#settle(this.#yes && this.#fullySeen());
		if (matchesKey(data, "up") || data === "k") return this.#scroll(-1, total);
		if (matchesKey(data, "down") || data === "j") return this.#scroll(1, total);
		if (matchesKey(data, "pageUp")) return this.#scroll(-page, total);
		if (matchesKey(data, "pageDown") || data === " ") return this.#scroll(page, total);
		if (matchesKey(data, "home")) return this.#scroll(-total, total);
		if (matchesKey(data, "end")) return this.#scroll(total, total);
		if (matchesKey(data, "left") || matchesKey(data, "right") || matchesKey(data, "tab") || data === "y" || data === "Y") {
			const wantYes = data === "y" || data === "Y" ? true : !this.#yes;
			if (wantYes && !this.#fullySeen()) {
				this.#notice = "Yes is locked until the full content has been scrolled into view.";
				this.#yes = false;
			} else {
				this.#notice = "";
				this.#yes = wantYes;
			}
			this.host.requestRender?.();
		}
	}
}

/** Ask for approval through the scrollable view. Resolves false on deny,
 *  timeout, a missing/failed UI, or any error: never approves by default. */
export async function confirmScrollable(
	ui: Pick<ExtensionUIContext, "custom">,
	options: ScrollableApprovalOptions,
): Promise<boolean> {
	if (typeof ui.custom !== "function") return false;
	try {
		const result = await ui.custom<boolean>(
			(tui, theme, _kb, done) => new ScrollableApproval(
				{ terminal: tui.terminal, requestRender: () => tui.requestRender() },
				theme as unknown as ApprovalViewTheme,
				options,
				done,
			),
			{ overlay: true, overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%", margin: 0 } },
		);
		return result === true;
	} catch {
		return false;
	}
}

/** True when the confirmation body is the raw unknown-tool argument dump
 *  (mirrors describeApprovalTarget's precedence): only these need scrolling. */
export function isRawArgumentApproval(params: Record<string, unknown>): boolean {
	return typeof params.command !== "string" && typeof params.path !== "string" && typeof params.tool === "string";
}

/** Interactive approval for one gated call. bash/write/edit keep the standard
 *  confirm; raw unknown-tool arguments use the scrollable fail-closed view. */
export async function askUserApproval(
	ui: Pick<ExtensionUIContext, "confirm" | "custom">,
	tool: string,
	params: Record<string, unknown>,
	body: string,
	timeoutMs: number,
	lock: <T>(run: () => Promise<T>) => Promise<T>,
): Promise<boolean> {
	const confirm = ui.confirm.bind(ui);
	const title = `agy ${tool}?`;
	if (isRawArgumentApproval(params)) return lock(() => confirmScrollable(ui, { title: "agy unknown-target native tool?", body, timeoutMs }));
	return lock(() => confirm(title, body, { timeout: timeoutMs }));
}
