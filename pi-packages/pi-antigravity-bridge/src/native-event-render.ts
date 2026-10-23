import path from "node:path";
import type { EntryRenderer } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	createKitRenderMemo,
	type RenderCardSection,
	resolveStatusGlyph,
} from "@thoth-agents/pi-core";
import { POLL_TOOL_NAME, type NativeDisplayEvent } from "./provider.js";
import type { PollRunData } from "./poll-fold.js";

export const renderNativeEvent: EntryRenderer<NativeDisplayEvent> = (
	entry,
	{ expanded },
	theme,
) => {
	const event = entry.data;
	// Prefer path, command, then display text; never duplicate the tool name as detail.
	const firstLine = (value: string | undefined): string | undefined =>
		value?.split(/\r?\n/, 1)[0].trim() || undefined;
	const detail = event?.path
		? path.basename(event.path)
		: (firstLine(event?.command) ?? firstLine(event?.output));
	const failed = event?.status === "failed";
	const headline = () => {
		const status = failed
			? theme.fg("error", resolveStatusGlyph("failed", "✗"))
			: theme.fg("success", resolveStatusGlyph("completed", "✓"));
		return `${status} ${theme.fg("toolTitle", event?.name ?? "Antigravity")}${detail ? ` ${theme.fg("muted", detail.slice(0, 160))}` : ""}`;
	};
	const lines: string[] = [];
	const sections: RenderCardSection[] = [];
	const body: string[] = [];
	if (expanded) {
		if (event?.path) {
			const location = theme.fg("dim", event.path);
			lines.push(location);
			body.push(location);
		}
		if (event?.diff) {
			const diff = event.diff
				.split("\n")
				.map((line) =>
					theme.fg(
						line.startsWith("+")
							? "toolDiffAdded"
							: line.startsWith("-")
								? "toolDiffRemoved"
								: "toolDiffContext",
						line,
					),
				);
			lines.push(...diff);
			sections.push({ title: "Diff", rows: diff });
		}
		if (event?.command)
			sections.push({
				title: "Command",
				rows: event.command
					.split("\n")
					.map((line) => theme.fg("toolOutput", line)),
			});
		if (event?.output && (!event.diff || failed)) {
			const output = theme.fg("toolOutput", event.output);
			lines.push(output);
			sections.push({
				title: "Output",
				rows: event.output
					.split("\n")
					.map((line) => theme.fg("toolOutput", line)),
			});
		}
	} else if (detail) body.push(theme.fg("muted", detail.slice(0, 160)));
	const native = new Text("", 0, 0);
	const memo = createKitRenderMemo();
	return {
		render(width) {
			return memo.render(width, (kit) => {
				if (kit) return kit.card(
					theme,
					{
						title: event?.name ?? "Antigravity",
						body,
						sections,
						status: failed ? "failed" : "completed",
						isSuccess: event?.status === "completed",
						isError: failed,
					},
					width,
				);
				native.setText([headline(), ...lines].join("\n"));
				return native.render(width);
			});
		},
		invalidate() {
			memo.invalidate();
			native.invalidate();
		},
	};
};

export const renderPollRun: EntryRenderer<PollRunData> = (
	entry,
	{ expanded },
	theme,
) => {
	const run = entry.data;
	const count = run?.count ?? 0;
	const failed = run?.state === "failed";
	const label = theme.fg("muted", `Poll ${run?.target ?? "bridge call"} (x${count}${failed ? ", failed" : ""})`);
	const body = [label];
	if (expanded && run) {
		const time = (iso: string): string => new Date(iso).toLocaleTimeString();
		body.push(theme.fg("dim", `${count} ${count === 1 ? "poll" : "polls"}, ${time(run.firstAt)} → ${time(run.lastAt)}`));
	}
	const native = new Text(`♊︎ ${theme.fg("toolTitle", POLL_TOOL_NAME)} ${body.join("\n")}`, 0, 0);
	const memo = createKitRenderMemo();
	return {
		render(width) {
			return memo.render(width, (kit) => {
				if (kit) return kit.card(theme, {
					title: POLL_TOOL_NAME,
					body,
					status: failed ? "failed" : run?.state === "done" ? "completed" : "running",
					isSuccess: run?.state === "done",
					isError: failed,
				}, width);
				return native.render(width);
			});
		},
		invalidate() {
			memo.invalidate();
			native.invalidate();
		},
	};
};
