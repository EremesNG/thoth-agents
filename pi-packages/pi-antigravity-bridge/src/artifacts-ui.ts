// /agy artifacts overlay: SelectList over one conversation's artifacts.
//
// UI mirrors the engine picker (tui.md "Pattern 1"): SelectList framed by
// DynamicBorder inside pi's native overlay. Read-only on purpose: enter
// opens the selected file with the OS default handler, r rescans (the list
// is always a fresh scan), esc closes. No delete keys — agy's files are
// agy's to manage.

import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@earendil-works/pi-tui";
import { resolveIcon } from "@thoth-agents/pi-core";
import type { AgyArtifact } from "./artifacts.js";

export type ArtifactsBrowserAction =
	| { type: "open"; artifact: AgyArtifact }
	| { type: "rescan" }
	| { type: "close" };

function humanBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

export function artifactItems(artifacts: AgyArtifact[]): SelectItem[] {
	return artifacts.map((a, i) => {
		const when = new Date(a.modifiedMs);
		const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
		return {
			value: String(i),
			label: a.name,
			get description() { return [a.kind, a.mediaType, humanBytes(a.bytes), stamp].join(` ${resolveIcon('separator', '·')} `); },
		};
	});
}

/** Render the overlay. Resolves with what the user asked for: open (with the
 *  selected artifact), rescan, or close. */
export async function showArtifactsBrowser(
	ctx: ExtensionUIContext,
	artifacts: AgyArtifact[],
): Promise<ArtifactsBrowserAction> {
	const items = artifactItems(artifacts);
	return ctx.custom<ArtifactsBrowserAction>((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(
			new Text(theme.fg("accent", theme.bold(`Antigravity artifacts (${artifacts.length})`)), 1, 0),
		);
		container.addChild(new Spacer(1));

		const list = new SelectList(items, Math.min(items.length, 12), {
			selectedPrefix: (t: string) => theme.fg("accent", t),
			selectedText: (t: string) => theme.fg("accent", t.startsWith("→ ") ? `${resolveIcon("selection", "→")} ${t.slice(2)}` : t),
			description: (t: string) => theme.fg("muted", t),
			scrollInfo: (t: string) => theme.fg("dim", t),
			noMatch: (t: string) => theme.fg("warning", t),
		});
		list.onSelect = (item) => done({ type: "open", artifact: artifacts[Number(item.value)] });
		list.onCancel = () => done({ type: "close" });
		container.addChild(list);

		container.addChild(new Spacer(1));
		container.addChild(
			{ render: (width: number) => new Text(theme.fg("dim", `${resolveIcon('arrowUp', '↑')}${resolveIcon('arrowDown', '↓')} navigate ${resolveIcon('separator', '·')} enter open ${resolveIcon('separator', '·')} r rescan ${resolveIcon('separator', '·')} esc close`), 1, 0).render(width), invalidate() {} },
		);
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				// r rescan; enter opens (via onSelect), esc cancels (via onCancel).
				if (data.trim().toLowerCase() === "r") {
					done({ type: "rescan" });
					return;
				}
				list.handleInput(data);
				tui.requestRender();
			},
		};
	}, {
		overlay: true,
		overlayOptions: { anchor: "center" as const, width: 84, maxHeight: "85%" as const, margin: 1 },
	});
}
