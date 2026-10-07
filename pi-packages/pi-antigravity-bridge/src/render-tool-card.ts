import type { Theme } from "@earendil-works/pi-coding-agent";
import { Box, type Component, Text } from "@earendil-works/pi-tui";
import {
	getRenderKit,
	type RenderCardOptions,
	type RenderIndicatorContext,
	renderToolFooter,
	type ThothRenderKit,
} from "@thoth-agents/pi-core";

interface ShellState {
	hasResult: boolean;
	isPartial: boolean;
	isError: boolean;
	/** Share bridge failures for KIT parts without changing the native SDK shell. */
	resultIsError?: boolean;
}

/** Call/result share the SDK's state, composing one shell in either rendering path. */
export function renderToolCard(
	theme: Theme,
	text: string | (() => string),
	options: (kit: ThothRenderKit) => RenderCardOptions,
	part: "start" | "end",
	context?: RenderIndicatorContext,
	fallback = { isPartial: true, isError: false },
): Component {
	const shell = (context?.state?.antigravityShell as
		| ShellState
		| undefined) ?? { hasResult: false, ...fallback };
	if (context?.state) context.state.antigravityShell = shell;
	shell.isPartial = context?.isPartial ?? fallback.isPartial;
	shell.isError = context?.isError ?? fallback.isError;
	if (part === "end") {
		shell.hasResult = true;
		shell.resultIsError = fallback.isError;
	}
	const content = () => new Text(typeof text === "function" ? text() : text, 0, 0);
	return {
		render(width) {
			const kit = getRenderKit();
			if (kit) {
				const card = options(kit);
				const isError = Boolean(
					card.isError || shell.isError || shell.resultIsError,
				);
				const status =
					card.status ??
					(shell.isPartial || !shell.hasResult
						? "running"
						: isError
							? "failed"
							: "completed");
				const footerContext = card.context ?? context;
				const completed =
					shell.hasResult &&
					!shell.isPartial &&
					!isError &&
					context?.executionStarted !== false &&
					status === "completed";
				return kit.card(
					theme,
					{
						...card,
						status,
						context: footerContext,
						footer:
							card.footer ??
							renderToolFooter(kit, theme, {
								status,
								context: footerContext,
								summary: card.summary,
							}),
						part: part === "start" && !shell.hasResult ? "full" : part,
						isError,
						isSuccess: completed,
					},
					width,
				);
			}
			const role = shell.isPartial
				? "toolPendingBg"
				: shell.isError
					? "toolErrorBg"
					: "toolSuccessBg";
			const bg = (row: string) => theme.bg(role, row);
			const native = new Box(1, 0, bg);
			native.addChild(content());
			const padding = bg(" ".repeat(Math.max(0, width)));
			return [
				...(part === "start" ? [padding] : []),
				...native.render(width),
				...(part === "end" || !shell.hasResult ? [padding] : []),
			];
		},
		invalidate() {
			// Text is rebuilt at render time so mounted rows follow kit changes.
		},
	};
}
