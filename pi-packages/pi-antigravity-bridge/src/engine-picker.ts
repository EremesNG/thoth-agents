// First-run onboarding: the engine picker plus the agy-presence warning.
//
// On the first interactive start (no config file yet, no AGY_ENGINE env) pi
// asks which turn engine to use: the stream-json `agy` CLI or Google's
// native ACP subcommand. The choice persists via saveConfig({ engine }) and,
// like /agy engine, takes effect on the next pi start (drivers wire at load).
// First Antigravity use on either engine checks that the
// `agy` binary exists and warns until it does (re-auth is out of scope).
//
// UI: tui.md "Pattern 1" - SelectList framed by DynamicBorder inside pi's
// native overlay (the window feel pi-rtk builds its modal on).

import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { openOwnedOverlay, resolveIcon } from "@thoth-agents/pi-core";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
	Container,
	type SelectItem,
	SelectList,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import fs from "node:fs";
import path from "node:path";
import type { Engine } from "./config.js";

/** Picker order is the default answer order: acp first. */
export const ENGINE_PICKER_ITEMS: SelectItem[] = [
	{
		value: "acp",
		label: "Native ACP (agy acp)",
		description: "default, recommended (agy >= 1.5.3, shared CLI sign-in)",
	},
	{
		value: "stream-json",
		label: "Stream-JSON CLI",
		description: "persistent stream-json CLI engine",
	},
];

/** Intro paragraph above the list. Text wraps, so explanations stay here and
 *  SelectItem descriptions stay one-liners (SelectList truncates long lines). */
export const ENGINE_PICKER_INTRO = [
	"Pick the engine that runs your Antigravity turns. Switch anytime with /agy engine (restart applies it).",
	"",
	"ACP: native `agy acp` (agy >= 1.5.3). Default. Shares the CLI installation and Google credentials; no separate server or sign-in.",
	"stream-json: the `agy` CLI you already installed and authenticated. Persistent process, streamed output.",
].join("\n");

/** True only for a genuine first interactive run: no saved config yet (any
 *  existing file means the user has been here before) and no AGY_ENGINE env
 *  (env wins over the file, so the wizard would fight it). Fails closed to
 *  false - an fs error must never nag the user with a dialog. */
export function shouldOfferEnginePicker(
	configPath: string,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (env.AGY_ENGINE !== undefined) return false;
	try {
		return !fs.existsSync(configPath);
	} catch {
		return false;
	}
}

/** Narrow a picker value to an Engine. Items are our own constants, but an
 *  unknown value must never reach config as a cast string: it falls back to
 *  the default ("acp"). */
export function toEngine(value: string): Engine {
	return value === "stream-json" ? "stream-json" : "acp";
}

/** Saving an engine never installs software or signs the user in. */
export function savedEngineMessage(engine: Engine): string {
	return engine === "acp"
		? "Engine saved: acp. Requires agy >= 1.5.3 and shares its Google sign-in. Restart pi to apply."
		: "Engine saved: stream-json. Restart pi to apply.";
}

/** Bare-name suffix candidates per platform. Windows pins the probe to
 *  agy.exe: that is the only artifact Google ships there, and .bat/.cmd
 *  cannot spawn anyway (shell:false + EINVAL since CVE-2024-27980). */
function executableSuffixes(platform: NodeJS.Platform): string[] {
	return platform === "win32" ? [".EXE"] : [""];
}

/** True when the `agy` CLI binary can be found. A binRef carrying a path
 *  separator must exist as a file - backslashes count as separators on
 *  win32, where path.join would mangle a bare "C:\..." AGY_BIN into a PATH
 *  segment. Otherwise the bare name is searched on PATH, appending the
 *  Windows candidate (agy.exe only: Google ships nothing else there, and
 *  an extensionless or .cmd file cannot be spawned anyway). A bare
 *  AGY_BIN that already ends in .exe probes the raw name too. Only a
 *  regular file counts; races fail closed. */
export function isAgyInstalled(
	binRef: string,
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (binRef.includes("/") || (platform === "win32" && binRef.includes("\\"))) {
		try {
			return fs.statSync(binRef).isFile();
		} catch {
			return false;
		}
	}
	let suffixes = executableSuffixes(platform);
	// A bare AGY_BIN=agy.exe already carries the extension; name+suffix
	// would stat agy.exe.EXE and miss the real file (issue #11 class).
	if (platform === "win32" && path.extname(binRef).toLowerCase() === ".exe") {
		suffixes = ["", ...suffixes];
	}
	return (env.PATH ?? "")
		.split(path.delimiter)
		.filter(Boolean)
		.some((dir) =>
			suffixes.some((suffix) => {
				try {
					return fs.statSync(path.join(dir, binRef) + suffix).isFile();
				} catch {
					return false;
				}
			}),
		);
}

/** Toast copy for the missing-CLI warning. Fires every pi start while the
 *  stream-json engine is active and the binary is absent. */
export function agyMissingMessage(): string {
	return "The `agy` CLI is not installed. Install it from https://antigravity.google/product/antigravity-cli and log in on it to use Antigravity models.";
}

/** Render the picker overlay. Resolves with the chosen engine, null on esc,
 *  or undefined on session teardown (nothing is persisted on cancellation). */
export async function showEnginePicker(ctx: ExtensionUIContext): Promise<Engine | null | undefined> {
	return openOwnedOverlay<Engine | null | undefined>(
		{ ui: ctx },
		(tui, theme, _keybindings, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			container.addChild(
				new Text(theme.fg("accent", theme.bold("Antigravity Bridge: choose your engine")), 1, 0),
			);
			container.addChild(new Text(theme.fg("muted", ENGINE_PICKER_INTRO), 1, 0));
			container.addChild(new Spacer(1));

			const list = new SelectList(ENGINE_PICKER_ITEMS, ENGINE_PICKER_ITEMS.length, {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t.startsWith("→ ") ? `${resolveIcon("selection", "→")} ${t.slice(2)}` : t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			});
			list.onSelect = (item) => done(toEngine(item.value));
			list.onCancel = () => done(null);
			container.addChild(list);

			container.addChild(new Spacer(1));
			container.addChild(
				{ render: (width: number) => new Text(theme.fg("dim", `${resolveIcon('arrowUp', '↑')}${resolveIcon('arrowDown', '↓')} navigate ${resolveIcon('separator', '·')} enter select ${resolveIcon('separator', '·')} esc decide later`), 1, 0).render(width), invalidate() {} },
			);
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					list.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{
			overlayOptions: { anchor: "center" as const, width: 80, maxHeight: "85%" as const, margin: 1 },
		},
	);
}

export const CLI_SIGN_IN_INSTRUCTIONS = "Run agy in your terminal and complete Google sign-in. Both engines share the CLI credentials. Install or update agy (ACP requires >= 1.5.3) from https://antigravity.google/product/antigravity-cli. The bridge never runs an installer.";
