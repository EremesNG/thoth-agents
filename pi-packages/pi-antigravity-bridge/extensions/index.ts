// pi-antigravity-bridge - extension entry point.
//
// Registers Gemini (via the agy CLI) as a pi model provider so it shows up in
// the /model picker as antigravity/gemini-*. When selected, pi routes each turn
// through streamSimple, which feeds the persistent stream-json driver process
// and streams the agent text back into pi's TUI.
//
// Architectural wall (cannot be worked around - see PLAN.md):
//   agy runs its OWN closed tool loop against --add-dir. pi's read/write/edit/
//   bash tools never fire. Tool activity is surfaced as thinking events
//   ("[agy tool: editing foo.ts]") for visibility, but the edits already landed
//   on disk and pi's inline diff review does not engage.
//
// /agy command: full runtime config surface (engine, mode, permissions,
// bridge tools, model, thinking, digest, system prompt) plus
// doctor, auth, and session clear. Config persists to
// ~/.pi/agent/antigravity-bridge/config.json so toggles survive restarts.

import { waitWithDeadline } from "../src/waits.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
	type ExtensionAPI,
	type BuildSystemPromptOptions,
	type ExtensionCommandContext,
	type ExtensionUIContext,
	createBashToolDefinition,
	createEditToolDefinition,
	createWriteToolDefinition,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	SettingsList,
	Text,
	type SettingItem,
} from "@earendil-works/pi-tui";
import {
	entriesFromRaw,
	FALLBACK_MODELS,
	loadModelCatalogRaw,
	refreshModelCatalogIfNeeded,
	toPiModel,
	type AgyModelEntry,
} from "../src/models.js";
import { SessionStore } from "../src/sessions.js";
import {
	APPROVAL_PARK_MS,
	POLL_TOOL_NAME,
	ToolRoundTrips,
	WrapperReplay,
	createStreamSimple,
	defaultEscalateAfterMs,
	formatEscalatedAck,
	formatPollAnswer,
	type NativeDisplayEvent,
} from "../src/provider.js";
import { PollRunFolder, type PollRunData } from "../src/poll-fold.js";
import {
	createShadowTool,
	stripMarkerFields,
	type AnyToolDefinition,
	type GatePolicy,
} from "../src/approval-gate.js";
import { detectPermissionGateExtensions, resolveGateMode } from "../src/approval-detect.js";
import { approvalHookFileName, hookScriptSource, removeGateHooks, stageGateHooks, sweepWorkspaceGateGroups } from "../src/approval-hook.js";
import {
	formatRunCommandGuardReason,
	guardHooksStaged,
	isRunCommandGuardActive,
	removeRunCommandGuardHooks,
	stageRunCommandGuardHooks,
	writeGuardHookScript,
} from "../src/run-command-guard.js";
import { StreamDriver } from "../src/driver.js";
import { AcpDriver } from "../src/acp/driver.js";
import { stagedAcpMcpServers } from "../src/acp/mcp-servers.js";
import { stageAgyHome, sweepStagedAgyHomes, type OwnBridgeEntry } from "../src/acp/home.js";
import { probeGeminiDirFlag } from "../src/gemini-dir-probe.js";
import { cleanupManagedAcpInstall } from "../src/acp/setup.js";
import type { TurnDriver, TurnOutcome } from "../src/driver-types.js";
import { CONFIG_PATH, loadConfig, logsDir, MAX_TURN_CAP_MIN, parseCapMinutes, saveConfig, type AgyMode, type BridgeTools, type Engine, type ThinkingTier } from "../src/config.js";
import { CLI_SIGN_IN_INSTRUCTIONS, agyMissingMessage, isAgyInstalled, savedEngineMessage, showEnginePicker, shouldOfferEnginePicker } from "../src/engine-picker.js";
import { agyVersionVerdict, checkAgyCliVersion, describeAgyVersionCheck, MIN_AGY_ACP_VERSION, MIN_AGY_VERSION } from "../src/agy-version.js";
import { isValidAgyAgentName, listAgyAgents } from "../src/agents.js";
import { resolveIcon, settleOwnedOverlays } from '@thoth-agents/pi-core';
import { formatSubagentRoster, SubagentRoster } from "../src/subagent-roster.js";
import { spawn } from "node:child_process";
import { fetchAgyQuota, formatAgyQuotaReport } from "../src/usage.js";
import { artifactOpenCommand, listAgyArtifacts } from "../src/artifacts.js";
import { showArtifactsBrowser } from "../src/artifacts-ui.js";
import { listAgyTasks, tailAgyTaskLog } from "../src/tasks.js";
import { showTasksBrowser } from "../src/tasks-ui.js";
import { agyConversationDir } from "../src/agy-paths.js";
import { createDailyLogger, type DailyLogger } from "../src/daily-log.js";
import { emitLifecycle } from "../src/lifecycle.js";
import { registerAskAntigravityTool, toolModelsFromRaw } from "../src/ask-tool.js";
import { renderNativeEvent, renderPollRun } from "../src/native-event-render.js";
import { registerWebTools } from "../src/web-tools.js";
import { acquirePrivateBridgeServerName, bridgeMcpConfigDir, startMcpServer, TOKEN_HEADER, type McpServerHandle } from "../src/mcp-server.js";
import {
	bridgeServerName,
	registerBridgeServer,
	healBridgeSuppression,
	sweepStaleBridgeServers,
	unregisterBridgeServer,
} from "../src/mcp-registration.js";
import {
	ACTIVATE_SKILL_TOOL_NAME,
	activateSkillSchema,
	catalogSummary,
	findSkillByName,
	readSkillBody,
	scanSkills,
	type SkillLite,
} from "../src/skills.js";
import { mapAgyToolToNative } from "../src/native-tools.js";
import {
	CALL_TOOL_NAME,
	TOOL_INFO_TOOL_NAME,
	bridgeCallToolDef,
	bridgeToolInfoDef,
	bridgedPiTools,
	formatBridgeToolInfo,
	parseBridgeCallRequest,
	partitionBridgeTools,
	serializeToolSchema,
} from "../src/bridge-catalog.js";
import { Type } from "typebox";
import { withDialogLock } from "../src/dialog-lock.js";
import { createPublishedToolRegistrar } from "../src/tool-publication.js";

// Only the process-wide tool-claim marker is shared. Drivers, UI and bridge
// endpoints belong to an extension factory, including in-process children.
const activeInstances = new Set<string>();
const ACTIVE_BRIDGE = Symbol.for("pi-antigravity-bridge:active");

function resolveAgyBinary(): string {
	return process.env.AGY_BIN || "agy";
}

// UI sinks are best-effort, even when a void-typed implementation is async.
function notifyUi(ui: ExtensionUIContext | null | undefined, ...args: Parameters<ExtensionUIContext["notify"]>): void {
	emitLifecycle(() => ui?.notify(...args));
}



function setUiStatus(ui: ExtensionUIContext | null | undefined, ...args: Parameters<ExtensionUIContext["setStatus"]>): void {
	emitLifecycle(() => ui?.setStatus(...args));
}

function setDimStatus(ui: ExtensionUIContext | null, key: string, text: string | undefined): void {
	emitLifecycle(() => ui?.setStatus(key, text === undefined ? undefined : ui.theme.fg("dim", text)));
}

export default async function (pi: ExtensionAPI): Promise<void> {
	const { registerTool, registerAdaptiveTool } = createPublishedToolRegistrar(pi);
	// Claim the AskAntigravity tool for this process. pi-ask-antigravity (if also
	// installed) checks this in-process flag OR the bridge's package.json on disk
	// and defers. See that extension's isBridgeInstalled().
	const instanceId = randomUUID();
	const bridgeDir = bridgeMcpConfigDir(instanceId);
	const acpHooksDir = path.join(bridgeDir, "acp-hooks");
	const guardScriptPath = path.join(bridgeDir, "run-command-guard.mjs");
	let activeUi: ExtensionUIContext | null = null;
	const claimActive = () => {
		activeInstances.add(instanceId);
		(globalThis as Record<symbol, unknown>)[ACTIVE_BRIDGE] = true;
	};
	claimActive();

	const binary = resolveAgyBinary();

	// Await bounded discovery on stale/missing cache before registering either
	// catalog. Failures retain stale data, then use the shared static fallback.
	const raw = await loadModelCatalogRaw(binary);
	const discovered = entriesFromRaw(raw);
	const usingFallback = discovered.length === 0;
	const entries: AgyModelEntry[] = usingFallback ? FALLBACK_MODELS : discovered;
	const toolModels = toolModelsFromRaw(usingFallback
		? entries.flatMap((entry) => entry.efforts?.map((effort) => `${entry.full}-${effort}`) ?? [entry.full]).join("\n")
		: raw);
	// Engine latched at load: /agy engine takes effect on the next pi start
	// (documented). Everything below resolves from THIS value - per-call
	// config reads would let a mid-session flip leave ToolRoundTrips,
	// kickIdle, and reentry pointing at the other engine (round-7 finding).
	const engine: Engine = loadConfig().engine;
	const bridgeDiscovery = loadConfig().bridgeDiscovery;
	let serverName = bridgeDiscovery === "private" ? `pi-agy-${instanceId.replaceAll("-", "").slice(0, 8)}` : "pi-antigravity-bridge";
	let acpServerName = bridgeDiscovery === "private" ? serverName : "pi-bridge";
	let privateNameReservation: ReturnType<typeof acquirePrivateBridgeServerName> | null = null;
	const releasePrivateName = () => { privateNameReservation?.release(); privateNameReservation = null; };
	// Both engines deliver images: ACP uses native blocks; stream-json stages
	// files and points the prompt at the Pi read tool.
	const modelInput: Array<"text" | "image"> = ["text", "image"];
	const models = entries.map((e) => toPiModel(e, modelInput));

	// failAll reasons the bridge treats as routine (turn end / shutdown
	// sweep), not faults. Shared by the emitters below and the mcpLog
	// classifier so the substring match cannot drift from the text.
	const FAIL_REASON_TURN_END = "antigravity turn ended with an unresolved pi tool call";
	const FAIL_REASON_SHUTDOWN = "antigravity session shut down";

	// Daily file log: every sink below feeds ~/.pi/extensions-data/
	// estebanforge/pi-antigravity-bridge/logs/<YYYY-MM-DD>.ndjson (see
	// src/daily-log.ts). Fire-and-forget, secrets redacted, old days pruned.
	// Support flow: "attach the last days' files from that dir".
	const fileLog = createDailyLogger({ dir: logsDir() });
	// Warn tier = user-facing: the default file log keeps ONLY errors (zero
	// routine disk traffic), so a warn that never reaches the UI is lost.
	// Every warn toasts here instead; AGY_DEBUG=1 restores the full file
	// trail. Silent exceptions: deliberate aborts (pi already shows
	// "Operation aborted") and connection exits (the turn's own error block
	// carries real crashes). call-tool-fail needs no exclusion here: its tier
	// is debug or error, never warn. No UI (headless): warn text falls back
	// to stderr.
	const rawFileLog = fileLog.log.bind(fileLog);
	fileLog.log = (event, data, level) => {
		emitLifecycle(() => {
			rawFileLog(event, data, level);
			if (level !== "warn") return;
			if (event.startsWith("abort:") || event === "connection-exited") return;
			const d = (data ?? {}) as Record<string, unknown>;
			let text: string;
			if (event === "tool-schema-omitted") {
				text = `Pi tool ${String(d.name ?? "tool")} omitted from Antigravity: ${String(d.reason ?? "unsupported input schema")}`;
			} else if (event === "round-trip-fail") {
				text = `Bridge tool call failed: ${String(d.name ?? "tool")} (${String(d.reason ?? "unknown")})`;
			} else if (event.startsWith("stall:")) {
				text = "Antigravity stalled with no output; the turn was stopped";
			} else if (event.startsWith("timeout:")) {
				text = "Antigravity turn timed out";
			} else if (event.startsWith("exit:") && event !== "exit:0") {
				text = "Antigravity process exited unexpectedly";
			} else if (event === "turn-error") {
				text = `Antigravity turn issue: ${String(d.reason ?? "unknown")}`;
			} else {
				text = `Antigravity warning: ${event}`;
			}
			if (activeUi) notifyUi(activeUi, text, "warning");
			else console.error(`[antigravity-bridge] ${text}`);
		});
	};
	fileLog.log(
		"extension-load",
		{ engine, models: models.length, fallback: usingFallback, bridge: loadConfig().bridgeTools, askTool: loadConfig().askTool, webTools: loadConfig().webTools },
		"info",
	);

	const store = new SessionStore();
	// MCP bridge handle, declared early: the ACP engine reads the bridge port
	// at session/new / session/load time.
	let mcpHandle: McpServerHandle | null = null;
	let ownedDescriptorCacheName: string | null = null;
	let projectTrusted = false;
	let lifecycleEpoch = 0;
	let stopped = false;
	let bridgeReady = false;
	let startFlight: Promise<void> | null = null;
	let shutdownFlight: Promise<void> | null = null;
	let mixedDiscoveryWarned = false;
	type GuardSnapshot = { active: boolean; serverName: string };
	let sessionGuardSnapshot: GuardSnapshot | null = null;

	// One flight owns startup. A generation guard travels with each stream so
	// a shutdown (including /new or resume) cannot resurrect an old turn.
	async function ensureBridgeStarted(): Promise<() => void> {
		const epoch = lifecycleEpoch;
		const assertCurrent = () => {
			if (stopped || epoch !== lifecycleEpoch) throw new Error("antigravity session shut down during startup");
		};
		assertCurrent();
		if (!bridgeReady) {
			if (!startFlight) {
				const flight = waitWithDeadline(Promise.resolve().then(() => startBridge(epoch)), loadConfig().startupTimeoutMs, "startFlight").then(() => {
					if (!stopped && epoch === lifecycleEpoch) bridgeReady = true;
				}).catch(error => {
					// Fence late startup work at its existing epoch checks. A retry
					// gets a new generation; the expired flight cannot publish readiness.
					if (epoch === lifecycleEpoch) {
						lifecycleEpoch++;
						clearGuardSnapshot();
					}
					throw error;
				}).finally(() => { if (startFlight === flight) startFlight = null; });
				startFlight = flight;
			}
			await startFlight;
		}
		return assertCurrent;
	}
	// Session-only visibility overrides; never change either application's MCP config.
	const hiddenBridgeTools = new Set<string>();
	const currentDiscoveryServerName = () => (
		bridgeDiscovery === "private"
			? serverName
			: engine === "acp" ? acpServerName : bridgeServerName(process.pid, instanceId)
	);
	const computeGuardSnapshot = (): GuardSnapshot => {
		const cfg = loadConfig();
		const active = isRunCommandGuardActive({
			sessionMode,
			enabled: cfg.runCommandGuard,
			bridgeTools: cfg.bridgeTools,
			allTools: pi.getAllTools(),
			activeTools: pi.getActiveTools(),
			hiddenTools: hiddenBridgeTools,
		});
		return { active, serverName: currentDiscoveryServerName() };
	};
	const getGuardContext = (): GuardSnapshot => sessionGuardSnapshot ?? computeGuardSnapshot();
	const clearGuardSnapshot = (): void => {
		sessionGuardSnapshot = null;
	};
	const getBridgeTools = () => {
		const cfg = loadConfig();
		return bridgedPiTools(
			pi.getAllTools(),
			pi.getActiveTools(),
			cfg.bridgeTools,
			hiddenBridgeTools,
			getGuardContext().active,
		);
	};
	// Approval-gate hook script (instance-owned, token embedded). Written at session
	// start when the gate is active; removed at session_shutdown.
	let gateScriptPath: string | null = null;
	let gateShadowsRegistered = false;
	let activeApprovalPark: McpServerHandle["approvals"] | undefined;
	function syncRunCommandGuardHooks(guard: GuardSnapshot = getGuardContext()): boolean {
		if (guard.active) {
			const reason = formatRunCommandGuardReason(guard.serverName);
			writeGuardHookScript(guardScriptPath, reason);
			if (engine === "acp") {
				stageRunCommandGuardHooks(acpHooksDir, guardScriptPath);
				removeRunCommandGuardHooks(bridgeDir);
			} else {
				stageRunCommandGuardHooks(bridgeDir, guardScriptPath);
				removeRunCommandGuardHooks(acpHooksDir);
			}
		} else {
			removeRunCommandGuardHooks(bridgeDir);
			removeRunCommandGuardHooks(acpHooksDir);
			try { fs.rmSync(guardScriptPath, { force: true }); } catch { /* best effort */ }
			try { fs.rmSync(acpHooksDir, { recursive: true, force: true }); } catch { /* best effort */ }
		}
		return guard.active;
	}
	let managedAcpCleanupRan = false;
	let legacyAcpWarningShown = false;
	let agyMissingWarned = false;
	let agyVersionWarned = false;
	let streamHomeSupported = false;
	let streamHomeChecked = false;
	let homeFallbackWarned = false;
	function warnHomeFallback(detail: string): void {
		if (homeFallbackWarned) return;
		homeFallbackWarned = true;
		const message = `MCP home isolation unavailable (${detail}); keeping ${bridgeDiscovery === "private" ? "additive private configuration (no global registration)" : "legacy global registration"}.`;
		if (activeUi) notifyUi(activeUi, message, "warning");
		else console.error(`[antigravity-bridge] ${message}`);
	}
	function registerLegacyFallback(): void {
		if (bridgeDiscovery !== "legacy-global" || !mcpHandle) return;
		const registration = registerBridgeServer({ pid: process.pid, instanceId, port: mcpHandle.port, token: mcpHandle.token, tokenHeader: TOKEN_HEADER });
		if (registration.wrote) ownedDescriptorCacheName = bridgeServerName(process.pid, instanceId);
	}
	function stageEngineHome(prefix: "acp-home" | "agy-home"): string | undefined {
		if (process.env.AGY_AGENTS_ROOT) return undefined;
		if (prefix === "agy-home" && !streamHomeSupported) return undefined;
		const ownBridge: OwnBridgeEntry | undefined = mcpHandle ? {
			name: bridgeDiscovery === "private" ? serverName : prefix === "acp-home" ? acpServerName : bridgeServerName(process.pid, instanceId),
			port: mcpHandle.port, token: mcpHandle.token, tokenHeader: TOKEN_HEADER,
		} : undefined;
		try { return stageAgyHome({ prefix, ownBridge }); }
		catch (error) {
			if (prefix === "acp-home") throw new Error(`Cannot stage isolated ACP home: ${String(error)}`);
			warnHomeFallback(`staging failed: ${String(error)}`);
			registerLegacyFallback();
			return undefined;
		}
	}
	// Two turn engines behind one contract (plan §9): stream-json (tested
	// default) and the official ACP server (opt-in via config.engine, off by
	// default). Neither spawns anything until its first turn.
	// ACP log routing: only genuine failures reach stderr. Routine lifecycle
	// (driver-created, spawn, session-new, ...) stays in the driver's
	// #lifecycle ring buffer, visible via /agy doctor. An unfiltered sink fired
	// console.error at extension load ("driver-created"), before any UI exists,
	// and leaked raw driver lines into the terminal on every startup.
	const acpFailures = new Set([
		"start-failed", "spawn-error", "parse-error", "write-failed",
		"mode-apply-failed", "timeout", "stall", "auth-required",
		"session-load-failed-creating-fresh", "connection-exited", "cancel-failed",
		"unsupported-server-request", "termination-warning", "carrier-staging-warning",
	]);
	const streamDriver = new StreamDriver(bridgeDir);
	streamDriver.stageHome = () => stageEngineHome("agy-home");
	// Mirror the stream driver's lifecycle ring into the daily file log
	// (spawn/exit/abort/stall/recycle). The ACP driver reaches the same file
	// through acpLog below.
	streamDriver.log = (msg, data) => {
		// Level classification mirrors acpLog's failure set: stalls, aborts,
		// timeouts and nonzero exits are the "what broke" greps (warn);
		// turn-start is the per-turn skeleton (info); everything else is
		// verbose-only (debug, needs AGY_DEBUG).
		const failed =
			msg.startsWith("timeout:") ||
			msg.startsWith("stall:") ||
			msg.startsWith("abort:") ||
			(msg.startsWith("exit:") && msg !== "exit:0") ||
			msg === "termination-warning" ||
			msg === "image-staging-failed";
		const level = failed ? "warn" : msg === "turn-start" ? "info" : "debug";
		fileLog.log(msg, data, level);
	};
	const acpLog = (msg: string, data?: unknown): void => {
		const expectedExit = msg === "connection-exited" && (data as { expected?: boolean } | undefined)?.expected === true;
		fileLog.log(msg, data, expectedExit ? "debug" : acpFailures.has(msg) ? "warn" : msg === "turn-start" ? "info" : "debug");
	};
	const acpDriver = new AcpDriver({
		bin: resolveAgyBinary,
		stageHome: () => stageEngineHome("acp-home"),
		hooksDir: () => (guardHooksStaged(acpHooksDir) ? acpHooksDir : undefined),
		// Resolved per turn: /agy and AGY_USAGE_ESTIMATE changes apply without
		// a restart. Without this the driver defaults to "estimate" and the
		// config knob (incl. "off") is dead.
		usageEstimate: () => loadConfig().acp.usageEstimate,
		// ACP request_permission parity with the approval gate: skipPermissions
		// turns auto-allow in the driver; approvals.mode allow short-circuits
		// to the same synchronous allow; everything else opens a dialog (esc
		// and headless deny fail-closed) under the shared dialog lock.
		permissionPolicy: () => (loadConfig().approvals.mode === "allow" ? "auto" : "deny"),
		onPermissionRequest: async (req) => {
			const ui = activeUi;
			if (loadConfig().approvals.mode === "deny" || !ui) return undefined;
			return await withDialogLock(async () => {
				const labels = req.options.map((o) => o.name ?? o.kind ?? o.optionId ?? "?");
				const title = req.toolCall?.title ? `agy requests: ${req.toolCall.title}` : "agy requests permission";
				const picked = await ui.select(title, labels);
				if (picked === undefined) return undefined;
				const idx = labels.indexOf(picked);
				return idx >= 0 ? (req.options[idx]?.optionId ?? undefined) : undefined;
			});
		},
		log: acpLog,
		mcpServers: (home) => {
			const inherited = stagedAcpMcpServers(home, acpLog);
			const handle = mcpHandle;
			if (!handle) return inherited;
			// The bridge 403s any request without the shared-secret header; the
			// stream engine carries it via mcp_config.json, ACP via headers[].
			return [
				{
					name: acpServerName,
					type: "http",
					url: `http://127.0.0.1:${handle.port}/mcp`,
					headers: [{ name: TOKEN_HEADER, value: handle.token }],
				},
				...inherited,
			];
		},
	});
	// The active engine is resolved from the latched load-time value.
	const activeDriver = (): TurnDriver => (engine === "acp" ? acpDriver : streamDriver);
	// The provider's stream-json slot gets the STREAM driver explicitly - never
	// activeDriver(), or a load-time acp engine would make deps.driver and
	// deps.acpDriver the same object and break the engine identity check.
	const driver = streamDriver;
	// The no-patch pi-tool round-trip store: the MCP bridge parks calls here;
	// the provider emits them as real pi toolUse turns and completes them from
	// the next call's toolResult.
	const roundTrips = new ToolRoundTrips(
		activeDriver,
		(s, d, level) =>
			fileLog.log(
				s,
				d,
				level ?? (s === "round-trip-fail" ? "warn" : "debug"),
			),
		// Re-read custom long-running names for each bridge call.
		{ escalateAfterMs: (name) => defaultEscalateAfterMs(name, loadConfig().escalateLongTools) },
	);
	const replay = new WrapperReplay();
	// Subagent roster: folded from every driver activity (both engines) via
	// the provider; /agy subagents renders it. In-memory, process-lifetime.
	const roster = new SubagentRoster();
	// ACP tool activity is display-only: durable Pi entries with native-looking
	// titles and optional diffs. Unlike a synthetic Pi toolCall this does not
	// re-execute edits, park the turn, or add tool results to model context.
	if (engine === "acp") {
		pi.registerEntryRenderer<NativeDisplayEvent>("agy-native-event", renderNativeEvent);
		pi.registerEntryRenderer<PollRunData>("agy-poll-run", renderPollRun);
	}
	let pendingNativeTools = 0;
	const pollRuns = new PollRunFolder();
	const persistPollRun = (run: PollRunData | undefined): void => {
		if (run) emitLifecycle(() => pi.appendEntry<PollRunData>("agy-poll-run", run));
	};
	const closePollRun = (): void => {
		persistPollRun(pollRuns.flush());
		setDimStatus(activeUi, "agy-poll", undefined);
	};
	const onNativeEvent = (event: NativeDisplayEvent): void => {
		if (engine !== "acp" || stopped) return;
		// Polls never have real Pi cards; ACP can omit their MCP server tag.
		if (event.name === POLL_TOOL_NAME) {
			// One call emits start + completion frames. Count only the result.
			if (event.status === "started") return;
			const view = event.callId ? roundTrips.poll(event.callId) : undefined;
			// Missing registry entries produce terminal errors in formatPollAnswer.
			const state = event.status === "failed" ? "failed" : view?.state ?? "failed";
			persistPollRun(pollRuns.add(view?.name ?? "unknown call", state, new Date()));
			if (state !== "running") {
				closePollRun();
				return;
			}
			const open = pollRuns.open;
			setDimStatus(activeUi, "agy-poll", open ? `♊︎ bridge_poll_result → ${open.target} (x${open.count})` : undefined);
			return;
		}
		closePollRun();
		if (event.mcpServer === acpServerName) return;
		// MCP calls through our own pi-bridge already have genuine Pi tool cards;
		// only native Antigravity / other MCP events need display-only entries.
		if (event.status === "started") {
			pendingNativeTools++;
			setDimStatus(activeUi, "agy-native", `agy ${event.name}${resolveIcon('ellipsis', '…')} (${pendingNativeTools})`);
			return;
		}
		pendingNativeTools = Math.max(0, pendingNativeTools - 1);
		if (pendingNativeTools === 0) setUiStatus(activeUi, "agy-native", undefined);
		// Bound persisted session size; the ACP result and diff may be megabytes.
		return pi.appendEntry<NativeDisplayEvent>("agy-native-event", {
			...event,
			output: event.output?.slice(0, 4000),
			diff: event.diff?.slice(0, 12000),
			command: event.command?.slice(0, 500),
		});
	};
	// Native re-exec only emits for builtins actually active in the session;
	// anything else (or an unknown name) falls back to the wrapper card.
	const nativeActive = (name: string): boolean => {
		try {
			return pi.getActiveTools().includes(name);
		} catch {
			return false;
		}
	};
	// A settled turn cannot answer its parked calls; the driver never sees
	// ToolRoundTrips, so the provider bridges the two here (both engines).
	// The file log records the outcome first: ERROR/aborted turns are the
	// single most useful support signal.
	const onTurnEnd = (outcome: TurnOutcome) => {
		fileLog.log(
			"turn-end",
			// Error text can embed the child's stderr tail; cap it in line with
			// the ACP driver's 200-char stderr slices.
			{ status: outcome.status, error: outcome.error?.slice(0, 500), aborted: outcome.aborted },
			outcome.status === "OK" ? "info" : "warn",
		);
		roundTrips.failAll(FAIL_REASON_TURN_END);
		closePollRun();
		// Each park learns its conversation from its originating handle.outcome.
		// A turn-end sweep would stamp still-running calls owned by other turns.
	};
	streamDriver.onTurnEnd = onTurnEnd;
	acpDriver.onTurnEnd = onTurnEnd;
	// Pi's normal footer receives the incremental usage above. Mark the
	// numbers as estimates in the status area too; ACP currently drops the
	// SDK's exact usage metadata before it reaches the client.
	if (engine === "acp") {
		let lastUsageStatus = "";
		pi.on("message_update", (event, ctx) => {
			if (!ctx.hasUI || event.message.role !== "assistant" || event.message.provider !== "antigravity" || loadConfig().acp.usageEstimate === "off") return;
			const { input, output } = event.message.usage;
			const status = `ACP ≈ ${input} in / ${output} out`;
			if (status !== lastUsageStatus) {
				lastUsageStatus = status;
				setDimStatus(ctx.ui, "agy-usage", status);
			}
		});
		const clearUsageStatus = (_event: unknown, ctx: { hasUI: boolean; ui: ExtensionUIContext }) => {
			lastUsageStatus = "";
			if (ctx.hasUI) setUiStatus(ctx.ui, "agy-usage", undefined);
		};
		pi.on("agent_end", (event, ctx) => {
			clearUsageStatus(event, ctx);
			pendingNativeTools = 0;
			closePollRun();
			if (ctx.hasUI) setUiStatus(ctx.ui, "agy-native", undefined);
		});
		pi.on("session_shutdown", (event, ctx) => {
			clearUsageStatus(event, ctx);
			pendingNativeTools = 0;
			closePollRun();
			if (ctx.hasUI) setUiStatus(ctx.ui, "agy-native", undefined);
		});
	}
	let systemPromptOptions: BuildSystemPromptOptions | undefined;
	let sessionMode: string | undefined;
	pi.on("before_agent_start", (event, ctx) => {
		systemPromptOptions = event.systemPromptOptions;
		sessionMode = ctx.mode;
	});
	const streamSimple = createStreamSimple({
		getSystemPromptOptions: () => systemPromptOptions,
		getSessionMode: () => sessionMode,
		getRunCommandGuard: () => getGuardContext(),
		entries,
		store,
		driver,
		acpDriver,
		roundTrips,
		replay,
		nativeActive,
		onNativeEvent,
		roster,
		engine,
		beforeStart: ensureBridgeStarted,
		log: fileLog.log.bind(fileLog),
	});

	pi.registerProvider("antigravity", {
		name: "Antigravity (agy)",
		baseUrl: "agy-bridge://antigravity",
		apiKey: "not-used",
		api: "agy-bridge",
		models: models.map((m) => ({
			id: m.id,
			name: m.name,
			api: m.api,
			reasoning: m.reasoning,
			thinkingLevelMap: m.thinkingLevelMap,
			input: m.input,
			cost: m.cost,
			contextWindow: m.contextWindow,
			maxTokens: m.maxTokens,
		})),
		streamSimple,
	});

	registerAgyCommand(pi, {
		entries,
		store,
		usingFallback,
		driver,
		acpDriver,
		engine,
		getMcpPort: () => mcpHandle?.port ?? null,
		setUi: (ui) => { activeUi = ui; },
		bridgeTools: getBridgeTools,
		hiddenBridgeTools,
		fileLog,
		roster,
		runAcpPickSetup,
	});

	// AskAntigravity tool: one-shot delegation to agy (ported from
	// pi-ask-antigravity). When both extensions are installed, the bridge wins
	// and pi-ask-antigravity registers nothing (its load-time defer guard
	// detects this package via import.meta.resolve). Off by default; opt in with askTool=true
	// (config file, AGY_ASK_TOOL, /agy ask, or the picker). While off, registration is skipped
	// entirely - users who want only the provider keep a clean tool list.
	// Note: the active flag below is set regardless of askTool, so
	// pi-ask-antigravity keeps deferring even then: off means NO delegation
	// tool from either package, not a fallback to pi-ask-antigravity.
	if (loadConfig().askTool) await registerAskAntigravityTool({ registerTool: registerAdaptiveTool }, toolModels, fileLog.log.bind(fileLog), bridgeDiscovery);
	// Web tools are opt-in (config.webTools, default off): Antigravity sessions
	// already have native web tools; these serve NON-Antigravity providers.
	if (loadConfig().webTools) registerWebTools({ registerTool: registerAdaptiveTool }, { log: fileLog.log.bind(fileLog) });

	// Display-only wrapper tool: the provider emits mutating agy steps as
	// toolCalls against it (never re-executed - execute() replays the output
	// agy already recorded). Keep it active for replay but omit its declaration
	// from provider requests; models must not call it.
	registerTool({
		name: "antigravity",
		label: "Antigravity",
		description: "",
		prepareLoadout: () => ({ hiddenDeclarations: ["antigravity"] }),
		parameters: Type.Object({
			tool: Type.String({ description: "agy tool name that produced this step." }),
			key: Type.String({ description: "Internal replay key. Do not fabricate." }),
		}),
		execute: async (_toolCallId, params) => {
			const key = (params as { key?: string }).key ?? "";
			const output = replay.take(key) ?? `(no recorded output for ${key})`;
			return { content: [{ type: "text", text: output }], details: { replay: true } };
		},
	});

	async function runAcpPickSetup(ctx: { ui: ExtensionUIContext }): Promise<void> {
		notifyUi(ctx.ui, CLI_SIGN_IN_INSTRUCTIONS, "info");
	}

	// MCP tool bridge: expose pi's tools to agy over localhost Streamable HTTP.
	// Calls park in the provider's round-trip store and complete through pi's
	// normal toolUse loop (native cards, permissions, hooks) - no patch, no
	// privileged API. Started on first Antigravity use, torn down on session_shutdown.
	pi.on("session_start", async (event, ctx) => {
		sessionMode = ctx.mode;
		if (shutdownFlight) await shutdownFlight;
		stopped = false;
		projectTrusted = ctx.isProjectTrusted();
		claimActive();
		if (ctx.hasUI) activeUi = ctx.ui;
		sweepStagedAgyHomes();
		const migrationNotice = (message: string) => {
			if (activeUi) notifyUi(activeUi, message, "warning");
			else console.error(`[antigravity-bridge] ${message}`);
		};
		if (!legacyAcpWarningShown && process.env.AGY_ACP_BIN !== undefined) {
			legacyAcpWarningShown = true;
			migrationNotice("AGY_ACP_BIN is retired and ignored. Unset it; both engines now use AGY_BIN or agy on PATH.");
		}
		if (!managedAcpCleanupRan) {
			managedAcpCleanupRan = true;
			try {
				const cleanup = cleanupManagedAcpInstall();
				if (cleanup.removedBuilds.length) fileLog.log("legacy-acp-cleanup", cleanup, "info");
				const credentials = path.join(os.homedir(), ".gemini", "antigravity-acp");
				if (fs.existsSync(credentials)) migrationNotice(`Standalone ACP credentials remain at ${credentials}. Remove them manually if no longer needed; the bridge never deletes credentials.`);
			} catch (err) {
				fileLog.log("legacy-acp-cleanup", { error: String(err) }, "warn");
			}
		}
		// First-run engine picker: ask once, on the first interactive start,
		// which turn engine to use. Skipped headless (ctx.mode !== "tui"),
		// when AGY_ENGINE is set, or once any config file exists (any save -
		// even of an unrelated knob - means the user has been here before).
		// esc = decide later: nothing is written, the picker reappears next
		// start. Like /agy engine, the choice applies on the next start
		// (drivers wire at load). The await intentionally runs before the
		// bridge startup below: on a genuine first run the modal blocks input
		// anyway, so the delay is invisible.
		if (event.reason === "startup" && ctx.mode === "tui" && shouldOfferEnginePicker(CONFIG_PATH)) {
			// Best-effort: picker failures (mid-prompt TUI teardown, resize races)
			// must never take down session_start, including MCP bridge startup.
			// The default engine keeps working untouched.
			try {
				const picked = await showEnginePicker(ctx.ui);
				if (picked === undefined) return;
				if (picked) {
					saveConfig({ engine: picked });
					notifyUi(ctx.ui, savedEngineMessage(picked), "info");
					if (picked === "acp") emitLifecycle(() => runAcpPickSetup(ctx));
				}
			} catch (err) {
				fileLog.log("engine-picker", { error: String(err) }, "warn");
				console.error(`[antigravity-bridge] engine picker failed: ${String(err)}`);
			}
		}
		if (ctx.model?.provider === "antigravity") await ensureBridgeStarted();
	});
	pi.on("model_select", async (event, ctx) => {
		sessionMode = (ctx as { mode?: string }).mode ?? sessionMode;
		if (ctx.hasUI) activeUi = ctx.ui;
		projectTrusted = ctx.isProjectTrusted();
		if (event.model.provider === "antigravity") await ensureBridgeStarted();
	});

	async function startBridge(epoch: number): Promise<void> {
		if (stopped || epoch !== lifecycleEpoch) return;
		// agy presence check (stream-json engine): the CLI is the whole engine,
		// so a missing binary means every Antigravity turn would fail. Warn once
		// per extension instance when the bridge first starts (first Antigravity
		// use), until it is installed; the flag keeps /new, /resume and /reload
		// re-fires from nagging mid-session.
		if (!agyMissingWarned && !isAgyInstalled(binary)) {
			agyMissingWarned = true;
			const msg = agyMissingMessage();
			if (activeUi) notifyUi(activeUi, msg, "warning");
			else console.error(`[antigravity-bridge] ${msg}`);
		}
		if (engine === "stream-json" && !streamHomeChecked && !process.env.AGY_AGENTS_ROOT) {
			if (isAgyInstalled(binary)) {
				const probe = await probeGeminiDirFlag(binary);
				if (stopped || epoch !== lifecycleEpoch) return;
				streamHomeChecked = true;
				streamHomeSupported = probe.supported;
				if (!probe.supported) warnHomeFallback(`capability probe ${probe.detail ?? "failed"}`);
				else if (probe.unverifiedVersion) {
					const message = `MCP home isolation is unverified on agy ${probe.version ?? "unknown"}; last live-verified version is 1.5.8.`;
					if (activeUi) notifyUi(activeUi, message, "warning"); else console.error(`[antigravity-bridge] ${message}`);
				}
			}
		}
		// Version gate (stream-json): an agy older than MIN_AGY_VERSION fails
		// turns with raw stream errors that look like bridge bugs. Warn once
		// with the fix in the message; doctor carries the full verdict.
		// Development builds and unreadable output stay silent here (an agy
		// from source works; doctor shows what we could not parse).
		if (engine === "stream-json" && !agyVersionWarned && isAgyInstalled(binary)) {
			await checkAgyCliVersion(binary).then((check) => {
				if (agyVersionWarned || check.status !== "unsupported") return;
				agyVersionWarned = true;
				const msg = `agy ${check.version} is too old; install ${MIN_AGY_VERSION} or newer. Stream-json turns may fail in confusing ways until then (/agy doctor inspects).`;
				if (activeUi) notifyUi(activeUi, msg, "warning");
				else console.error(`[antigravity-bridge] ${msg}`);
			});
		}
		if (stopped || epoch !== lifecycleEpoch) return;
		await refreshModelCatalogIfNeeded(binary);
		if (stopped || epoch !== lifecycleEpoch) return;
		// Bridge failure logger. Routine lifecycle (listening,
		// bridge-config-written/removed, closed) is normal startup/teardown
		// traffic: toasting it every session, or pinning it via stderr in
		// headless mode, was noise. Only genuine failures surface - as a
		// warning toast (activeUi.notify, ephemeral) or stderr when headless.
		// Per-turn success events (list-tools / call-tool) stay silent.
		const mcpLog = (s: string, d?: unknown) => {
			const failures = new Set([
				"http-error", "bridge-config-write-failed", "call-tool-fail",
				"transport-error", "handleRequest-error", "request-error",
				"request-handler-error", "unauthorized", "tool-schema-omitted",
			]);
			// Daily file log gets every bridge event (call-tool/list-tools
			// traffic included - it is how a parked round-trip is traced); the
			// filters below only decide what reaches the user. Bridge calls
			// start/end at info (one record per tool call, the fragile-path
			// skeleton); list-tools and startup chatter stay verbose.
			// Routine abort traffic (failAll on turn end / session shutdown
			// answers every parked call with an error) is not a fault: debug
			// only. Any other call-tool-fail is a real rejection (e.g. "no
			// active antigravity turn" from a client that should not see the
			// bridge) and lands at error tier - default mode records errors
			// only, so this is the sole durable trace of the incident.
			const detail = (d as { msg?: string } | undefined)?.msg ?? "";
			const routineAbort =
				s === "call-tool-fail" &&
				(detail.includes(FAIL_REASON_TURN_END) || detail.includes(FAIL_REASON_SHUTDOWN));
			const level = !failures.has(s)
				? s === "call-tool" || s === "call-tool-ok"
					? "info"
					: "debug"
				: routineAbort
					? "debug"
					: s === "call-tool-fail"
						? "error"
						: "warn";
			fileLog.log(s, d, level);
			// The warn-tier wrapper above already surfaces schema omissions with
			// the tool name and reason (stderr headless). Do not warn twice here.
			if (routineAbort || s === "tool-schema-omitted") return;
			if (!failures.has(s)) return;
			const msg = `[antigravity-bridge mcp] ${s}${d !== undefined ? " " + JSON.stringify(d) : ""}`;
			if (activeUi) notifyUi(activeUi, msg, "warning");
			else console.error(msg);
		};
		// Start the bridge unless the user turned it off. No patch gate, no
		// consent flow: calls route through pi's normal toolUse loop.
		const bridgeMode: BridgeTools = loadConfig().bridgeTools;
		if (bridgeMode === "none") {
			sessionGuardSnapshot = { active: false, serverName: currentDiscoveryServerName() };
			return; // user opted out
		}
		if (mcpHandle) return; // already running (reload re-fires session_start)
		// pi loads project skill locations only after the project is trusted;
		// mirror that gate. Global skill dirs are always scanned.
		const skills: SkillLite[] = scanSkills(projectTrusted ? process.cwd() : undefined);
		const listTools = () => {
			// /mcp and pi.setActiveTools() update the same live catalog. ACP gets
			// this endpoint through session/new or session/load; no global config write.
			const mode = loadConfig().bridgeTools;
			const { direct, proxied } = partitionBridgeTools(getBridgeTools());
			const tools = direct.map((t) => ({
				name: t.name,
				description: t.description ?? t.name,
				inputSchema: serializeToolSchema(t.parameters),
			}));
			if (mode !== "none" && proxied.length > 0) {
				tools.push(bridgeToolInfoDef(proxied), bridgeCallToolDef());
			}
			if (skills.length > 0 && mode !== "none") {
				tools.push({
					name: ACTIVATE_SKILL_TOOL_NAME,
					description: `Activate a pi Agent Skill by name. Catalog:\n${catalogSummary(skills)}`,
					inputSchema: activateSkillSchema(skills) as object,
				});
			}
			// Bridge-local, like activate_skill: answered from the escalation
			// registry without a pi round-trip. Pairs with the STILL RUNNING
			// early-ack that keeps slow calls under agy's ~180s request deadline.
			tools.push({
				name: POLL_TOOL_NAME,
				description:
					"Fetch the result of a long-running bridge tool call that answered STILL RUNNING with a callId. Poll again if it still reports running; the result or an error arrives here.",
				inputSchema: {
					type: "object",
					properties: { callId: { type: "string", description: "callId from the STILL RUNNING answer" } },
					required: ["callId"],
				},
			});
			return tools;
		};
		// activate_skill never round-trips through pi: the bridge answers it
		// directly by reading the SKILL.md (pi has no skill tool to execute).
		const bridgeOnToolCall = (
			callId: string,
			name: string,
			args: Record<string, unknown>,
			signal: AbortSignal,
		) => {
			// Bridge-local, like activate_skill: answered from the escalation
			// registry, never parked into pi.
			if (name === POLL_TOOL_NAME) {
				const wanted = typeof args.callId === "string" ? args.callId : "";
				mcpLog("poll-tool", { callId: wanted });
				const view = roundTrips.poll(wanted);
				// Internal peeks stay pure; only an actual terminal poll answer counts.
				// As upstream, a disconnect during the response write is not observable.
				if (view && view.state !== "running") roundTrips.markDelivered(wanted);
				return Promise.resolve(formatPollAnswer(wanted, view));
			}
			if (name === TOOL_INFO_TOOL_NAME) {
				const { proxied } = partitionBridgeTools(getBridgeTools());
				return Promise.resolve(formatBridgeToolInfo(proxied, args.names));
			}
			const dispatchPiTool = (targetName: string, targetArgs: Record<string, unknown>) =>
				roundTrips.onToolCall(callId, targetName, targetArgs, signal).then((r) => {
					// Early-ack: answer the HTTP request before agy's ~180s client
					// deadline with a poll handle; pi keeps executing meanwhile.
					if (!("escalated" in r)) return r;
					mcpLog("call-tool-escalated", { name: targetName, callId: r.callId });
					return formatEscalatedAck(r);
				});
			if (name === CALL_TOOL_NAME) {
				const parsed = parseBridgeCallRequest(args, getBridgeTools());
				if (!parsed.ok) {
					return Promise.resolve({ content: [{ type: "text", text: parsed.error }], isError: true });
				}
				return dispatchPiTool(parsed.name, parsed.args);
			}
			if (name !== ACTIVATE_SKILL_TOOL_NAME) {
				// Only authorized default-name tools may be called directly.
				// Cached extension schemas must not bypass the proxies.
				if (!partitionBridgeTools(getBridgeTools()).direct.some((tool) => tool.name === name)) {
					return Promise.resolve({ content: [{ type: "text", text: `Pi tool ${name} is not active or not exposed to Antigravity` }], isError: true });
				}
				return dispatchPiTool(name, args);
			}
			const wanted = typeof args.name === "string" ? args.name : "";
			const skill = loadConfig().bridgeTools !== "none" ? findSkillByName(skills, wanted) : undefined;
			const body = skill ? readSkillBody(skill) : `unknown skill: ${wanted || "(none given)"}`;
			return Promise.resolve({
				content: [
					{
						type: "text",
						text: skill ? `${body}\n\n[skill resources dir: ${skill.dir}]` : `Error: ${body}`,
					},
				],
				isError: !skill,
			});
		};
		if (bridgeDiscovery === "private" && !privateNameReservation) {
			privateNameReservation = acquirePrivateBridgeServerName(instanceId, serverName);
			serverName = privateNameReservation.name;
			acpServerName = serverName;
		}
		sessionGuardSnapshot = computeGuardSnapshot();
		const r = await startMcpServer(
			{
				listTools,
				onToolCall: bridgeOnToolCall,
				onApproval: (ticket, payload) => roundTrips.onApproval(ticket, payload),
				denyApprovalReason: (name) => {
					if (name !== "run_command") return undefined;
					const guard = getGuardContext();
					return guard.active ? formatRunCommandGuardReason(guard.serverName) : undefined;
				},
			},
			{
				log: mcpLog, configDir: bridgeDir, serverName,
				discoveryServerName: currentDiscoveryServerName(),
			},
		);
		if (stopped || epoch !== lifecycleEpoch) {
			clearGuardSnapshot();
			await r.handle?.close();
			releasePrivateName();
			return;
		}
		if (!r.ok || !r.handle) {
			clearGuardSnapshot();
			releasePrivateName();
		}
		if (r.ok && r.handle) {
			mcpHandle = r.handle;
			if (bridgeDiscovery === "private") ownedDescriptorCacheName = serverName;
			// Stale entries swept at start; entries a crashed delegation left
			// suppressed are healed here - but only when no live delegation is in
			// flight anywhere (marker-aware heal). A blind re-enable used to
			// un-hide the bridge during another session's active delegation.
			// Global-config hygiene runs on BOTH engines: a crashed stream-json
			// session must not leave dead-pid entries or stuck suppression flags
			// for the next one.
			const swept = sweepStaleBridgeServers();
			if (bridgeDiscovery === "private" && (process.env.AGY_AGENTS_ROOT || (engine === "stream-json" && !streamHomeSupported)) && swept.live.length > 0 && !mixedDiscoveryWarned) {
				mixedDiscoveryWarned = true;
				const message = "Private Antigravity discovery found a live legacy-global pi-bridge server. Mixed discovery modes are not isolated; restart all sessions in private mode.";
				if (activeUi) notifyUi(activeUi, message, "warning");
				else console.error(`[antigravity-bridge] ${message}`);
			}
			if (bridgeDiscovery === "legacy-global") healBridgeSuppression();
			// ACP supplies the bridge per-session (session/new | session/load);
			// only the stream-json CLI reads the global MCP config.
			if (engine === "stream-json" && (!streamHomeSupported || process.env.AGY_AGENTS_ROOT)) registerLegacyFallback();

			// --- Headless run_command guard (non-tui) ---------------------------
			const guardActive = syncRunCommandGuardHooks();
			if (guardActive) {
				fileLog.log("run-command-guard-staged", { engine, server: currentDiscoveryServerName() }, "info");
			}

			// --- Approval gate (docs/TODO.md 2.5) ------------------------------
			// agy native tool calls pass through a pi-side approval: a PreToolUse
			// hook parks in the bridge, the provider emits a shadow toolUse, and
			// pi's permission extensions gate it like any native call. Off until
			// enabled (auto = on only when a third-party gate extension exists).
			{
				const cfg = loadConfig();
				const mode = resolveGateMode(cfg.approvals.gateMode, detectPermissionGateExtensions());
				if (mode === "dedicated") {
					// The explicit antigravity_approve variant is planned; until it
					// ships, dedicated stages the same shadow tools. Say so, so the
					// config value never lies silently.
					fileLog.log("approval-dedicated-as-shadow", {}, "warn");
				}
				// Legacy cleanup (issue #5): 1.6.x staged the gate into the shared
				// workspace hooks.json, where standalone IDE/CLI sessions load it.
				// Staging now lives in the session-private add-dir; sweep groups left
				// behind by dead sessions from the old scheme. Live sessions' and
				// foreign groups are never touched.
				const sweptLegacy = sweepWorkspaceGateGroups(process.cwd());
				if (sweptLegacy > 0) fileLog.log("approval-workspace-swept", { swept: sweptLegacy }, "info");
				if (mode === "off") {
					activeApprovalPark = undefined;
					roundTrips.approvalPark = undefined;
					// Gate off: drop this session's private gate group while preserving
					// any staged run_command guard group.
					const unstaged = removeGateHooks(bridgeDir);
					if (unstaged.wrote) fileLog.log("approval-unstaged", unstaged, "info");
				} else {
					// Script: instance-private file; 0600 because the bridge token is
					// embedded (peer review 2026-09-07).
					const scriptPath = path.join(logsDir(), approvalHookFileName(process.pid, instanceId));
					fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
					fs.writeFileSync(
						scriptPath,
						hookScriptSource({
							port: r.handle.port,
							token: r.handle.token,
							deadlineMs: APPROVAL_PARK_MS,
						}),
						{ mode: 0o600 },
					);
					gateScriptPath = scriptPath;
					// Private per-pid staging (issue #5 isolation): the gate group goes
					// into the bridge add-dir that ONLY this session's agy receives.
					// Standalone sessions in the workspace never load it.
					const staged = stageGateHooks(bridgeDir, {
						port: r.handle.port,
						token: r.handle.token,
						scriptPath,
						parkBudgetMs: APPROVAL_PARK_MS,
						excludeRunCommand: guardActive,
					});
					fileLog.log("approval-staged", { mode, script: scriptPath, ...staged }, staged.wrote ? "info" : "debug");

					// Shadow bases: factory twins of pi's own builtins (public API).
					// pi.getAllTools() is unusable here: it returns ToolInfo, which
					// strips execute. Marker calls never execute; non-marker calls
					// delegate to the twins, so behavior matches the standard
					// builtins (session-level bash-operations overrides are not
					// inherited; documented in README).
					const handle = r.handle;
					if (!gateShadowsRegistered) {
						gateShadowsRegistered = true;
						const gateCwd = process.cwd();
						const bases: Record<string, AnyToolDefinition> = {
							bash: createBashToolDefinition(gateCwd) as unknown as AnyToolDefinition,
							write: createWriteToolDefinition(gateCwd) as unknown as AnyToolDefinition,
							edit: createEditToolDefinition(gateCwd) as unknown as AnyToolDefinition,
						};
						const policy: GatePolicy = async ({ tool, params, ctx }) => {
							const askMode = loadConfig().approvals.mode;
							if (askMode === "allow") return { allow: true };
							if (askMode === "deny") {
								return { allow: false, reason: `blocked by approval gate (mode: deny): ${tool}` };
							}
							const extCtx = ctx as { hasUI?: boolean; ui?: Pick<ExtensionUIContext, "confirm"> } | undefined;
							if (!extCtx?.hasUI || typeof extCtx.ui?.confirm !== "function") {
								return { allow: false, reason: `approval gate: no UI to approve ${tool} (headless)` };
							}
							const what =
								typeof params.command === "string"
									? params.command
									: typeof params.path === "string"
										? params.path
										: JSON.stringify(stripMarkerFields(params)).slice(0, 200);
							// Dialog lock: parallel agy tool approvals queue up instead of
							// clobbering the live dialog (which silently loses the approval).
							// Capture the narrowed method: TS drops the guard's narrowing
							// inside the deferred closure.
							const uiConfirm = extCtx.ui.confirm.bind(extCtx.ui);
							const ok = await withDialogLock(() =>
								uiConfirm(`agy ${tool}?`, what, { timeout: APPROVAL_PARK_MS }),
							);
							return ok ? { allow: true } : { allow: false, reason: `declined in pi (agy ${tool})` };
						};
						for (const base of Object.values(bases)) {
							registerTool(
								createShadowTool(base, policy, { verifyTicket: (t) => activeApprovalPark?.has(t) ?? false }),
							);
						}
					}
					// The park is wired ONLY after the shadows are registered: an
					// approval toolUse must never dispatch to the REAL builtin and
					// execute locally.
					activeApprovalPark = handle.approvals;
					roundTrips.approvalPark = handle.approvals;
				}
			}
		} else {
			console.error(`[antigravity-bridge] MCP tool bridge disabled: ${r.reason}`);
		}
	}
	pi.on("session_shutdown", async (_event, ctx) => {
		settleOwnedOverlays(ctx);
		if (shutdownFlight) return shutdownFlight;
		stopped = true;
		lifecycleEpoch++;
		bridgeReady = false;
		roundTrips.clearReplayTurns();
		const flight = (async () => {
			await startFlight?.catch(() => {});
			// Stop notifications from reaching a UI that has been torn down.
			activeUi = null;
			activeInstances.delete(instanceId);
			if (activeInstances.size === 0) delete (globalThis as Record<symbol, unknown>)[ACTIVE_BRIDGE];
			const h = mcpHandle;
			mcpHandle = null;
			activeApprovalPark = undefined;
			await h?.close();
			roundTrips.failAll(FAIL_REASON_SHUTDOWN);
			roundTrips.approvalPark = undefined;
			roundTrips.clearEscalations(FAIL_REASON_SHUTDOWN);
			clearGuardSnapshot();
			// "recycle", NOT "shutdown": pi fires session_shutdown on /new, /resume
			// and /fork (docs/extensions.md session lifecycle), not only on process
			// exit. The drivers are process-lifetime singletons; closing them with
			// "shutdown" latched them permanently and every later turn failed with
			// "ACP driver is shut down." (regression 2026-09-07). Recycle kills the
			// connection now; the next turn respawns it. event.reason is
			// deliberately ignored: recycle is correct even on real process exit
			// ("quit") - the connection kill is identical and nothing runs after.
			await streamDriver.close("recycle", "session shutdown");
			await acpDriver.close("recycle", "session shutdown");
			if (engine === "stream-json" && bridgeDiscovery === "legacy-global" && ownedDescriptorCacheName) unregisterBridgeServer(process.pid, undefined, instanceId);
			// Remove only an acquired, instance-unique discovery key, after both
			// engines stop writing. Shared legacy/ACP names are never owned.
			if (ownedDescriptorCacheName) {
				try {
					fs.rmSync(path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp", ownedDescriptorCacheName), { recursive: true, force: true });
				} catch { /* best effort */ }
				ownedDescriptorCacheName = null;
			}
			releasePrivateName();
			hiddenBridgeTools.clear();
			// Approval gate & run_command guard: unstage hooks and remove per-pid scripts.
			// Pending approvals already failed closed via handle close (bridge shutdown deny).
			const unstaged = removeGateHooks(bridgeDir);
			if (unstaged.wrote) fileLog.log("approval-unstaged", unstaged, "info");
			removeRunCommandGuardHooks(bridgeDir);
			removeRunCommandGuardHooks(acpHooksDir);
			try { fs.rmSync(guardScriptPath, { force: true }); } catch { /* best effort */ }
			try { fs.rmSync(acpHooksDir, { recursive: true, force: true }); } catch { /* best effort */ }
			if (gateScriptPath) {
				try {
					fs.rmSync(gateScriptPath, { force: true });
				} catch {
					/* best effort */
				}
				gateScriptPath = null;
			}
		})().finally(() => { if (shutdownFlight === flight) shutdownFlight = null; });
		shutdownFlight = flight;
		await flight;
	});
}

// --- /agy command -----------------------------------------------------------

interface AgyCommandCtx {
	entries: AgyModelEntry[];
	store: SessionStore;
	usingFallback: boolean;
	driver: TurnDriver;
	acpDriver: AcpDriver;
	/** Engine latched at extension load (see the provider wiring note). */
	engine: Engine;
	getMcpPort: () => number | null;
	setUi: (ui: ExtensionUIContext) => void;
	bridgeTools: () => Array<{ name: string }>;
	hiddenBridgeTools: Set<string>;
	/** Daily file logger (src/daily-log.ts); command + doctor surfacing. */
	fileLog: DailyLogger;
	/** Live subagent roster (folded in the provider); /agy subagents. */
	roster: SubagentRoster;
	/** Wizard-pick CLI setup instructions; reused
	 *  by /agy engine's no-args modal so both entry points behave alike. */
	runAcpPickSetup: (cmdCtx: { ui: ExtensionUIContext }) => Promise<void>;

}

interface PendingConfig {
	mode?: AgyMode;
	readOnly?: boolean;
	skipPermissions?: boolean;
	defaultModel?: string;
	defaultThinking?: ThinkingTier;
	turnTimeoutMin?: number;
	askTool?: boolean;
	webTools?: boolean;
	bridgeTools?: BridgeTools;
	digest?: boolean;
	systemPrompt?: boolean;
}

function settingsRows(ctx: AgyCommandCtx): string[] {
	const config = loadConfig();
	const perm = config.skipPermissions ? "auto-approved (DANGEROUS)" : "prompt (hangs in -p)";
	// padEnd keyed to the longest label ("AskAntigravity thinking:") so the
	// value column stays aligned as labels grow. Doctor-only state (engine,
	// models, sessions, config path) lives in /agy doctor, not here: one
	// surface per concern — this is the config surface, doctor is health.
	const row = (label: string, value: string) => `  ${label.padEnd(24)} ${value}`;
	return [
		row("mode:", config.mode),
		row("readOnly:", config.readOnly ? "on (provider turns and AskAntigravity are refused)" : "off"),
		row("permissions:", perm),
		row("AskAntigravity tool:", config.askTool ? "on" : "off"),
		row("Web tools:", config.webTools ? "on" : "off"),
		row("AskAntigravity model:", config.defaultModel),
		row("AskAntigravity thinking:", config.defaultThinking),
		row("bridge tools:", config.bridgeTools),
		row("digest:", config.digest ? "on" : "off"),
		row("system prompt:", config.systemPrompt ? "on" : "off"),
		row("runCommandGuard:", config.runCommandGuard ? "on (non-tui)" : "off"),
	];
}

function statusText(ctx: AgyCommandCtx): string {
	const config = loadConfig();
	const source = ctx.usingFallback ? "fallback (agy models failed)" : "discovered";
	return [
		"Antigravity bridge",
		`  engine:        ${config.engine}${config.engine === "acp" ? " (native agy acp, default)" : ""}`,
		`  models:        ${ctx.entries.length} ${source}`,
		...settingsRows(ctx),
		`  sessions:      ${ctx.store.size} bound`,
		`  config:        ${CONFIG_PATH}`,
		"",
		"Subcommands: /agy auth, /agy auth-manual, /agy engine stream-json|acp, /agy mode plan|accept-edits, /agy readonly on|off, /agy permissions on|off, /agy ask on|off, /agy model <alias>, /agy thinking low|medium|high, /agy agent <name|off>, /agy subagents, /agy quota, /agy artifacts [open <n|name>], /agy tasks [tail <id>], /agy bridge all|mcp|none, /agy tools [hide|show <name>|reset], /agy web on|off, /agy digest on|off, /agy system-prompt on|off, /agy timeout <1-1440|off>, /agy clear, /agy doctor",
	].join("\n");
}


function registerAgyCommand(pi: ExtensionAPI, ctx: AgyCommandCtx): void {
	pi.registerCommand("agy", {
		description:
			"Antigravity provider: doctor (health + settings), settings picker, clear sessions. Usage: /agy [doctor|auth|auth-manual|engine stream-json|acp|mode plan|accept-edits|readonly on|off|permissions on|off|ask on|off|model <alias>|thinking low|medium|high|agent <name|off>|subagents|quota|artifacts [open <n|name>]|tasks [tail <id>]|bridge all|mcp|none|tools [hide|show <name>|reset]|web on|off|digest on|off|system-prompt on|off|timeout <1-1440|off>|clear]",
		handler: async (args, cmdCtx: ExtensionCommandContext) => {
			const ui = cmdCtx.ui;
			if (ui) ctx.setUi(ui);
			const mode = cmdCtx.mode;
			const sub = (args ?? "").trim().split(/\s+/)[0]?.toLowerCase();
			const val = (args ?? "").trim().split(/\s+/)[1]?.toLowerCase();
			ctx.fileLog.log("agy-command", { args }, "info");

			// Direct subcommands work everywhere (headless + TUI).
			if (sub === "clear") {
				ctx.store.clear();
				notifyUi(ui, "Cleared all antigravity session bindings.", "info");
				return;
			}
			if (sub === "timeout") {
				// Free-type entry point for the turn cap (the TUI picker only offers
				// presets). Same sanity rules as loadConfig: 1..MAX valid, off/0
				// disables, anything else rejected with the valid range.
				const live = loadConfig();
				const cur = live.turnTimeoutMin;
				if (!val) {
					notifyUi(ui,
						`Turn time cap: ${cur === 0 ? "off (no cap)" : `${cur}m`}. Usage: /agy timeout <1-${MAX_TURN_CAP_MIN}|off>. Default: off on an interactive pi, 20m headless.`,
						"info",
					);
					return;
				}
				const parsed = val === "off" ? 0 : parseCapMinutes(val, Number.NaN);
				if (Number.isNaN(parsed)) {
					notifyUi(ui, `Invalid turn cap "${val}". Use 1-${MAX_TURN_CAP_MIN} minutes, or off/0 to disable.`, "error");
					return;
				}
				saveConfig({ turnTimeoutMin: parsed });
				notifyUi(ui,
					parsed === 0
						? `Turn time cap disabled. The inactivity stall guard (${live.inactivityTimeoutMin}m silence) still applies.`
						: `Turn time cap set to ${parsed}m. Takes effect next turn.`,
					"info",
				);
				return;
			}
			if (sub === "engine") {
				if (val === "acp" || val === "stream-json") {
					if (val === "acp" && loadConfig().mode === "plan") {
						notifyUi(ui, "mode is plan; the ACP engine has no plan mode. /agy mode accept-edits first.", "warning");
						return;
					}
					const next = saveConfig({ engine: val });
					if (next.engine !== "acp") {
						notifyUi(ui, "engine set to stream-json. Takes effect on the next pi start (or /reload).", "info");
						return;
					}
					notifyUi(ui, savedEngineMessage("acp"), "info");
				} else if (!val && mode === "tui" && ui) {
					// Same modal as the first-run wizard: switching engines deserves
					// the explanations, not a bare usage line. Semantics match the
					// direct path above: plan blocks provider turns; restart applies the switch.
					const current = loadConfig().engine;
					const picked = await showEnginePicker(ui);
					if (!picked) {
						notifyUi(ui, `engine unchanged: ${current}.`, "info");
						return;
					}
					if (picked === current) {
						notifyUi(ui, `engine is already ${current}. Restart applies it if set this session.`, "info");
						return;
					}
					if (picked === "acp" && loadConfig().mode === "plan") {
						notifyUi(ui, "mode is plan; the ACP engine has no plan mode. /agy mode accept-edits first.", "warning");
						return;
					}
					saveConfig({ engine: picked });
					notifyUi(ui, savedEngineMessage(picked), "info");
					if (picked === "acp") emitLifecycle(() => ctx.runAcpPickSetup({ ui }));
				} else {
					notifyUi(ui, `current engine: ${loadConfig().engine}\nusage: /agy engine stream-json|acp`, "info");
				}
				return;
			}
			if (sub === "auth" || sub === "auth-manual") {
				notifyUi(ui, CLI_SIGN_IN_INSTRUCTIONS, "info");
				return;
			}
			if (sub === "doctor") {
				const config = loadConfig();
				const engine = ctx.engine;
				const snap = (engine === "acp" ? ctx.acpDriver : ctx.driver).snapshot();
				const port = ctx.getMcpPort();
				const cliFloor = engine === "acp" ? MIN_AGY_ACP_VERSION : MIN_AGY_VERSION;
				const rawCheck = await checkAgyCliVersion(resolveAgyBinary());
				const cliCheck = rawCheck.status === "unavailable" ? rawCheck : agyVersionVerdict(rawCheck.raw, cliFloor);
				const lines = [
					"Antigravity doctor (no tokens spent)",
					`  engine:        ${engine}`,
					`  bridge:        ${config.bridgeTools}${port ? ` (port ${port})` : " (not running)"}`,
					`  driver:        ${snap.state}${snap.pid ? ` pid=${snap.pid}` : ""}${snap.conversationId ? ` session=${snap.conversationId.slice(0, 8)}` : ""}`,
					`  driver stats:  spawns=${snap.stats.spawns} turns=${snap.stats.turns} reused=${snap.stats.reused} recycles=${snap.stats.recycles}${snap.stats.lastRecycleReason ? ` (last: ${snap.stats.lastRecycleReason})` : ""}`,
					`  sessions:      ${ctx.store.size} bound`,
					`  models:        ${ctx.entries.length} ${ctx.usingFallback ? "FALLBACK (agy models failed)" : "discovered"}`,
					`  agy cli:       ${describeAgyVersionCheck(cliCheck)} (min ${cliFloor})`,
					`  config:        ${CONFIG_PATH}`,
					`  logs:          ${logsDir()} (attach recent days' files when reporting issues; set AGY_DEBUG=1 to capture details)`,
				];
				if (snap.engine === "acp" && snap.acp) {
					lines.push(
						`  acp session:   ${snap.acp.sessionId ?? "(none)"}`,
						`  acp server:    ${snap.acp.serverVersion ?? "unknown"}${snap.acp.agentTitle ? ` (${snap.acp.agentTitle})` : ""}`,
						`  acp stats:     prompts=${snap.acp.prompts} created=${snap.acp.sessionsCreated} loaded=${snap.acp.sessionsLoaded} kills=${snap.acp.kills} reconnects=${snap.acp.reconnects} cancel=notification`,
					);
					// Gate B watch: silent while the server offers no token counts; one
					// line the day it starts (then real usage mapping is worth wiring).
					if (snap.acp.usageSeen) {
						lines.push("  acp tokens:    AVAILABLE in server payloads (wire real usage mapping next)");
					} else if (config.acp.usageEstimate !== "off") {
						lines.push(`  acp tokens:    ESTIMATED client-side (mode: ${config.acp.usageEstimate}; auto-off once the server sends real usage)`);
					}
				}
				if (snap.lifecycle.length > 0) {
					lines.push("  lifecycle (last 5):");
					for (const entry of snap.lifecycle.slice(-5)) lines.push(`    ${entry}`);
				}
				// The config surface lives here too, so doctor is the ONE status
				// surface (former /agy status is gone).
				lines.push("", "settings:", ...settingsRows(ctx));
				notifyUi(ui, lines.join("\n"), "info");
				return;
			}
			if (sub === "mode") {
				if (val === "plan" || val === "accept-edits") {
					if (val === "plan" && ctx.engine === "acp") {
						notifyUi(ui, "plan cannot be enforced on provider turns on either engine (#1181). /agy mode accept-edits.", "warning");
						return;
					}
					const next = saveConfig({ mode: val as AgyMode });
					// saveConfig returns raw-file values; warnings must use effective config.
					const effective = loadConfig();
					notifyUi(ui, effective.readOnly
						? `mode set to ${next.mode}, but readOnly is on: provider turns are refused. /agy readonly off to lift (AGY_READONLY overrides config).`
						: effective.mode === "plan"
							? "mode set to plan: provider turns are REFUSED (the CLI does not gate writes under plan, #1181). Only AskAntigravity uses this mode."
							: `mode set to ${next.mode}`, "info");
				} else {
					const cfg = loadConfig();
					notifyUi(ui, `current mode: ${cfg.mode}${cfg.readOnly ? " (readOnly on: provider turns are refused)" : ""}\nusage: /agy mode plan|accept-edits`, "info");
				}
				return;
			}
			if (sub === "readonly") {
				if (val === "on" || val === "off") {
					const next = saveConfig({ readOnly: val === "on" });
					notifyUi(ui, next.readOnly
						? "readOnly is on: provider turns and AskAntigravity are REFUSED (the agy CLI cannot enforce review-only, #1181). Enforce read-only in the host, then /agy readonly off."
						: "readOnly off: provider turns follow /agy mode again.", "info");
					const effective = loadConfig().readOnly;
					if (effective !== next.readOnly) {
						notifyUi(ui, `AGY_READONLY is set in this environment and overrides the config: readOnly stays ${effective ? "on (refusing)" : "off"} until you unset it.`, "warning");
					}
				} else {
					const cfg = loadConfig();
					notifyUi(ui, `readOnly is ${cfg.readOnly ? "on (provider turns and AskAntigravity are refused)" : "off"}\nusage: /agy readonly on|off. The CLI cannot enforce review-only; on = refuse. Enforce read-only in the host.`, "info");
				}
				return;
			}
			if (sub === "tasks") {
				const engine = ctx.engine;
				const snap = (engine === "acp" ? ctx.acpDriver : ctx.driver).snapshot();
				const conversationId = snap.conversationId ?? undefined;
				if (!conversationId) {
					notifyUi(ui, "no Antigravity conversation bound yet; run a turn first.", "warning");
					return;
				}
				const dir = agyConversationDir(engine, conversationId);
				const rest = (args ?? "").trim().split(/\s+/);

				// /agy tasks tail <id>: last bytes of one task log into chat.
				// Resolved against the scanned list, not a rebuilt filename:
				// the id->filename convention must not live in two places.
				if (rest[0]?.toLowerCase() === "tail") {
					const id = Number(rest[1]);
					if (!Number.isInteger(id) || id < 0) {
						notifyUi(ui, "usage: /agy tasks tail <id>. /agy tasks lists them.", "warning");
						return;
					}
					const tasks = await listAgyTasks(dir);
					const task = tasks.find((t) => t.id === id);
					if (!task) {
						notifyUi(ui, `no task #${id} in this conversation. /agy tasks lists them.`, "warning");
						return;
					}
					const tail = await tailAgyTaskLog(task.logPath);
					if (tail === "") {
						notifyUi(ui, `task #${id} has no readable log.`, "warning");
						return;
					}
					const lines = tail.split("\n");
					const body = lines.length > 40 ? `${resolveIcon("ellipsis", "…")}\n${lines.slice(-40).join("\n")}` : tail;
					notifyUi(ui, `task #${id} tail:\n${body}`, "info");
					return;
				}

				// Dashboard form; r rescans by re-listing fresh.
				let tasks = await listAgyTasks(dir);
				if (tasks.length === 0) {
					notifyUi(ui, "no background tasks recorded for this conversation.", "info");
					return;
				}
				if (!ui) {
					const lines = tasks.map((t) => {
						const state = t.livenessKnown ? (t.active ? "ACTIVE" : "idle") : "liveness?";
						return `#${t.id}  ${state}  ${t.bytes}B`;
					});
					console.log([`antigravity tasks (${tasks.length}):`, ...lines].join("\n"));
					return;
				}
				for (;;) {
					const action = await showTasksBrowser(ui, tasks, tasks[0]?.livenessKnown ?? false);
					if (!action) return;
					if (action.type === "rescan") {
						tasks = await listAgyTasks(dir);
						if (tasks.length === 0) {
							notifyUi(ui, "no background tasks recorded for this conversation.", "info");
						}
						continue;
					}
					break;
				}
				return;
			}
			if (sub === "artifacts") {
				const engine = ctx.engine;
				const snap = (engine === "acp" ? ctx.acpDriver : ctx.driver).snapshot();
				const conversationId = snap.conversationId ?? undefined;
				if (!conversationId) {
					notifyUi(ui, "no Antigravity conversation bound yet; run a turn first.", "warning");
					return;
				}
				const dir = agyConversationDir(engine, conversationId);
				const rest = (args ?? "").trim().split(/\s+/).slice(1);
				const openWord = rest[0]?.toLowerCase();

				// /agy artifacts open <name|index>: direct open, no overlay.
				if (openWord === "open") {
					const artifacts = await listAgyArtifacts(dir);
					if (artifacts.length === 0) {
						notifyUi(ui, "no artifacts in this conversation.", "info");
						return;
					}
					const target = rest.slice(1).join(" ").trim();
					if (target === "") {
						notifyUi(ui, "usage: /agy artifacts open <name|index>. /agy artifacts lists them.", "warning");
						return;
					}
					const byIndex = /^\d+$/.test(target) ? Number(target) : undefined;
					const artifact =
						byIndex !== undefined
							? artifacts[byIndex]
							: artifacts.find((a) => a.name.toLowerCase() === target.toLowerCase()) ??
								(artifacts.filter((a) => a.name.toLowerCase().includes(target.toLowerCase())).length === 1
									? artifacts.find((a) => a.name.toLowerCase().includes(target.toLowerCase()))
									: undefined); // ambiguous or no match
					if (!artifact) {
						notifyUi(ui, `no unique artifact matches ${JSON.stringify(target)}. /agy artifacts lists them.`, "warning");
						return;
					}
					const openCmd = artifactOpenCommand();
					if (!openCmd) {
						notifyUi(ui, `no file-open handler for ${process.platform}; the file is at ${artifact.absolutePath}`, "warning");
						return;
					}
					spawn(openCmd.cmd, [artifact.absolutePath], { detached: true, stdio: "ignore", shell: false, windowsHide: true }).unref();
					notifyUi(ui, `opened ${artifact.name}`, "info");
					return;
				}

				// Browser loop; r rescans by re-listing fresh. The first scan is
				// reused so the emptiness gate does not cost a second readdir pass.
				let artifacts = await listAgyArtifacts(dir);
				if (artifacts.length === 0) {
					notifyUi(ui, "no artifacts in this conversation (media dirs appear once agy generates or receives files).", "info");
					return;
				}
				if (!ui) {
					// Headless: no overlay is possible; print the indexed list.
					const lines = artifacts.map((a, i) => `${i}  ${a.name} (${a.kind}, ${a.bytes}B)`);
					console.log([`antigravity artifacts (${artifacts.length}):`, ...lines].join("\n"));
					return;
				}
				for (;;) {
					const action = await showArtifactsBrowser(ui, artifacts);
					if (!action) return;
					if (action.type === "rescan") {
						artifacts = await listAgyArtifacts(dir);
						continue;
					}
					if (action.type === "open") {
						const openCmd = artifactOpenCommand();
						if (!openCmd) {
							notifyUi(ui, `no file-open handler for ${process.platform}.`, "warning");
							continue;
						}
						spawn(openCmd.cmd, [action.artifact.absolutePath], { detached: true, stdio: "ignore", shell: false, windowsHide: true }).unref();
					}
					break;
				}
				return;
			}
			if (sub === "quota") {
				// Quota lives in the CLI's Google identity. A pure-ACP install
				// without the CLI is a supported shape; say what is missing instead
				// of rendering a fetch failure.
				const bin = resolveAgyBinary();
				if (!isAgyInstalled(bin)) {
					notifyUi(ui,
						"quota comes from the agy CLI, which is not installed. ACP-only setups can install the CLI separately (same Google account) to see subscription quota (/agy doctor shows what IS available).",
						"warning",
					);
					return;
				}
				// /usage answers in ~10s live; surface the wait instead of a dead
				// command line.
				setUiStatus(ui, "agy-quota", `checking agy quota${resolveIcon('ellipsis', '…')}`);
				try {
					const report = await fetchAgyQuota(bin);
					if (report === undefined) {
						notifyUi(ui, "quota unavailable: agy did not return a /usage payload (see /agy doctor for binary health).", "warning");
						return;
					}
					notifyUi(ui, formatAgyQuotaReport(report), "info");
				} finally {
					setUiStatus(ui, "agy-quota", undefined);
				}
				return;
			}
			if (sub === "subagents") {
				const entries = ctx.roster.snapshot();
				if (entries.length === 0) {
					notifyUi(ui, "antigravity subagents: none tracked this session\n\nagy spawns subagents as ordinary tool steps; they appear here once a turn uses them.", "info");
					return;
				}
				notifyUi(ui, formatSubagentRoster(entries, { ui: true }), "info");
				return;
			}
			if (sub === "agent") {
				// ACP has no agent slot in the protocol (RC01): refuse instead of
				// silently ignoring a configured agent.
				if (ctx.engine === "acp") {
					notifyUi(ui, "the ACP engine has no agent selection (RC01). /agy engine stream-json first.", "warning");
					return;
				}
				const name = (args ?? "").trim().split(/\s+/).slice(1).join(" ").trim();
				if (!name) {
					const agents = await listAgyAgents(resolveAgyBinary());
					const current = loadConfig().agent;
					const agentList =
						agents.length > 0
							? agents.map((a) => `${a === current ? ">" : " "} ${a}`).join("\n")
							: "(no custom agents defined)";
					notifyUi(ui, `current agent: ${current ?? "(agy default)"}\n\n${agentList}\n\nusage: /agy agent <name|off>`, "info");
					return;
				}
				if (name === "off" || name === "none" || name === "default") {
					saveConfig({ agent: undefined });
					notifyUi(ui, "agent cleared: agy default", "info");
					return;
				}
				if (!isValidAgyAgentName(name)) {
					notifyUi(ui, `invalid agent name: ${name} (use letters, digits, dot, dash, underscore)`, "warning");
					return;
				}
				saveConfig({ agent: name });
				notifyUi(ui, `agent set: ${name} (takes effect on the next stream-json turn)`, "info");
				return;
			}
			if (sub === "permissions") {
				if (val === "on" || val === "off") {
					const next = saveConfig({ skipPermissions: val === "on" });
					const warn = next.skipPermissions ? "\nWARNING: agy can now run arbitrary commands without review." : "";
					notifyUi(ui, `permissions: ${next.skipPermissions ? "auto-approved (DANGEROUS)" : "prompt"}${warn}`, next.skipPermissions ? "warning" : "info");
				} else {
					notifyUi(ui, `permissions: ${loadConfig().skipPermissions ? "auto-approved (DANGEROUS)" : "prompt"}\nusage: /agy permissions on|off\n(off hangs any run_command in non-interactive mode)`, "info");
				}
				return;
			}
			if (sub === "bridge") {
				if (val === "all" || val === "mcp" || val === "none") {
					const next = saveConfig({ bridgeTools: val });
					notifyUi(ui,
						ctx.getMcpPort() === null
							? `bridge ${next.bridgeTools}. The bridge server is not running; /reload to apply.`
							: `bridge ${next.bridgeTools}. The active catalog and call guard update now; ACP may retain cached schemas until the next session/load.`,
						"info",
					);
				} else {
					notifyUi(ui, `bridge: ${loadConfig().bridgeTools}\nusage: /agy bridge all|mcp|none\n  all: active non-builtin pi tools. mcp: active pi-mcp-adapter tools + skills. none: bridge off.`, "info");
				}
				return;
			}
			if (sub === "tools") {
				const name = (args ?? "").trim().split(/\s+/).slice(2).join(" ");
				if (val === "reset") {
					ctx.hiddenBridgeTools.clear();
					notifyUi(ui, "Antigravity tool visibility reset for this Pi session. Pi's active tools are unchanged.", "info");
				} else if ((val === "hide" || val === "show") && name) {
					if (!pi.getAllTools().some((tool) => tool.name === name)) {
						notifyUi(ui, `Unknown Pi tool: ${name}`, "error");
						return;
					}
					if (val === "hide") ctx.hiddenBridgeTools.add(name);
					else ctx.hiddenBridgeTools.delete(name);
					notifyUi(ui, `${name}: ${val === "hide" ? "hidden from Antigravity" : "visible if active in Pi"}. No MCP config changed.`, "info");
				} else {
					notifyUi(ui, `Exposed active Pi tools: ${ctx.bridgeTools().map((tool) => tool.name).join(", ") || "(none)"}\nHidden in this session: ${[...ctx.hiddenBridgeTools].join(", ") || "(none)"}\n/agy tools hide|show <exact Pi tool name> | reset\nUse Pi's /mcp or pi.setActiveTools() to change the underlying active tools.`, "info");
				}
				return;
			}
			if (sub === "model") {
				if (val && val.length > 0) {
					const next = saveConfig({ defaultModel: val });
					notifyUi(ui, `AskAntigravity default model set to ${next.defaultModel}`, "info");
				} else {
					notifyUi(ui, `AskAntigravity model: ${loadConfig().defaultModel} (fallback; callers may override per call)\nusage: /agy model flash|pro|argon|gemini|<exact>`, "info");
				}
				return;
			}
			if (sub === "ask") {
				if (val === "on" || val === "off") {
					const next = saveConfig({ askTool: val === "on" });
					notifyUi(ui,
						next.askTool
							? "AskAntigravity tool on. Registered on the next pi start (or /reload)."
							: "AskAntigravity tool off. It is removed from the model's tool list on the next pi start (or /reload). Provider and models stay.",
						"info",
					);
				} else {
					notifyUi(ui, `AskAntigravity tool: ${loadConfig().askTool ? "on" : "off"}\nusage: /agy ask on|off`, "info");
				}
				return;
			}
			if (sub === "web") {
				if (val === "on" || val === "off") {
					const next = saveConfig({ webTools: val === "on" });
					notifyUi(ui,
						next.webTools
							? "Web tools on: agy_web_search and agy_read_url register on the next pi start (or /reload). Each call spends Antigravity quota."
							: "Web tools off: agy_web_search and agy_read_url will not register on the next pi start (or /reload).",
						"info",
					);
				} else {
					notifyUi(ui, `Web tools: ${loadConfig().webTools ? "on" : "off"}\nusage: /agy web on|off\nExposes agy_web_search + agy_read_url as Pi tools for ANY provider (Antigravity sessions already have native web tools). Default off; each call spends Antigravity quota.`, "info");
				}
				return;
			}
			if (sub === "digest") {
				if (val === "on" || val === "off") {
					const next = saveConfig({ digest: val === "on" });
					notifyUi(ui,
						next.digest
							? "digest on. pi-side context (compaction summaries, other-provider turns) is injected into each agy prompt. Note: this defeats agy's prompt cache (~25-30k tokens re-billed per turn)."
							: "digest off. agy prompts contain only your message; agy's prompt cache stays stable. Enable when mixing providers in one session and agy must see pi-side context.",
						"info",
					);
				} else {
					notifyUi(ui, `digest: ${loadConfig().digest ? "on" : "off"}\nusage: /agy digest on|off`, "info");
				}
				return;
			}
			if (sub === "system-prompt") {
				if (val === "on" || val === "off") {
					const next = saveConfig({ systemPrompt: val === "on" });
					notifyUi(ui,
						next.systemPrompt
							? "system-prompt on. pi's system prompt (incl. global and project AGENTS.md) is prepended to the first prompt of each new agy conversation. Existing conversations keep the version they started with."
							: "system-prompt off. agy runs on its own system prompt; pi instructions and AGENTS.md files are not sent.",
						"info",
					);
				} else {
					notifyUi(ui, `system-prompt: ${loadConfig().systemPrompt ? "on" : "off"}\nusage: /agy system-prompt on|off`, "info");
				}
				return;
			}

			if (sub === "thinking") {
				if (val === "low" || val === "medium" || val === "high") {
					const next = saveConfig({ defaultThinking: val as ThinkingTier });
					notifyUi(ui, `AskAntigravity default thinking set to ${next.defaultThinking}`, "info");
				} else {
					notifyUi(ui, `AskAntigravity thinking: ${loadConfig().defaultThinking} (fallback; callers may override per call)\nusage: /agy thinking low|medium|high`, "info");
				}
				return;
			}


			// No subcommand: print status, or open the picker in TUI. The old
			// "status" alias is retired; /agy doctor is the one status surface.
			if (sub) {
				const pointer = sub === "status" ? "/agy status was removed; use /agy doctor.\n" : "";
				notifyUi(ui, `${pointer}unknown subcommand: ${sub}\n${statusText(ctx)}`, "warning");
				return;
			}

			if (mode !== "tui" || !ui) {
				notifyUi(ui, statusText(ctx), "info");
				return;
			}

			await openAgyPicker(ui, ctx);
		},
	});
}

/** Interactive settings picker (TUI only). Rows: the runtime config surface
 *  (mode, permissions, model, thinking, bridge, digest, system prompt).
 *  Engine switching is command-only: /agy engine stream-json|acp (the
 *  command also runs self-service binary + auth setup for acp). */
async function openAgyPicker(ui: ExtensionUIContext, ctx: AgyCommandCtx): Promise<void> {
	const config = loadConfig();
	const pending: PendingConfig = {};

	const items: SettingItem[] = [
		{
			id: "mode",
			label: "Execution mode",
			description:
				"accept-edits: agy applies edits. plan: provider turns are REFUSED (#1181); AskAntigravity stages a restricted agent as a damper, not a read-only guarantee. Takes effect next turn.",
			currentValue: config.mode,
			values: ["accept-edits", "plan"],
		},
		{
			id: "readonly",
			label: "Read-only kill switch",
			description: "on: provider turns and AskAntigravity are REFUSED. The CLI cannot enforce review-only; enforce read-only in the host instead.",
			currentValue: config.readOnly ? "on" : "off",
			values: ["off", "on"],
		},
		{
			id: "permissions",
			label: "Permissions",
			description:
				"auto-approved: --dangerously-skip-permissions (required so commands don't hang in -p mode). prompt: agy asks y/n (hangs non-interactively).",
			currentValue: config.skipPermissions ? "auto-approved" : "prompt",
			values: ["auto-approved", "prompt"],
		},
		{
			id: "ask",
			label: "AskAntigravity tool",
			description:
				"Register the AskAntigravity one-shot delegation tool. off removes it from the model's tool list (provider and models stay, even with the separate pi-ask-antigravity package installed). Takes effect on the next pi start (or /reload).",
			currentValue: config.askTool ? "on" : "off",
			values: ["on", "off"],
		},
		{
			id: "web",
			label: "Web tools",
			description:
				"Register agy_web_search + agy_read_url as Pi tools for ANY provider. Default off: Antigravity sessions already have native web tools, and each call spends Antigravity quota. Takes effect on the next pi start (or /reload).",
			currentValue: config.webTools ? "on" : "off",
			values: ["on", "off"],
		},
		{
			id: "model",
			label: "AskAntigravity model",
			description:
				"AskAntigravity one-shot delegation tool: model used when its caller omits the model param. Callers may override per call; this is only the fallback. flash/pro/argon/gemini, another catalogued Gemini family, or an exact id. Does not affect the provider model you pick in /model.",
			currentValue: config.defaultModel,
			values: ["flash", "pro", "argon", "gemini"],
		},
		{
			id: "thinking",
			label: "AskAntigravity thinking",
			description:
				"AskAntigravity one-shot delegation tool: thinking tier used when the call names none. Callers may override per call; this is only the fallback. Pro has no Medium; it falls back to nearest.",
			currentValue: config.defaultThinking,
			values: ["low", "medium", "high"],
		},
		{
			id: "bridge",
			label: "Bridge tools",
			description:
				"Which pi tools the MCP bridge exposes to agy. all: every non-builtin tool (default). mcp: pi-mcp-adapter tools + skills. none: bridge off.",
			currentValue: config.bridgeTools,
			values: ["all", "mcp", "none"],
		},
		{
			id: "turn-cap",
			label: "Turn time cap",
			description:
				"Max minutes for ONE agy turn before the bridge kills it. Default: no cap on an interactive pi (abort with Esc), 20 headless. 0 disables; 1-1440 enables the gate. Free type via /agy timeout <minutes|off> or config.json. Takes effect next turn.",
			currentValue: String(config.turnTimeoutMin),
			values: ["0", "1", "5", "10", "15", "30", "60", "120", "360", "720", "1440"],
		},
		{
			id: "digest",
			label: "Context digest",
			description:
				"Inject a delta of pi-side context into each agy prompt. Defeats agy's prompt cache (~25-30k tokens re-billed per turn).",
			currentValue: config.digest ? "on" : "off",
			values: ["on", "off"],
		},
		{
			id: "system-prompt",
			label: "System prompt",
			description:
				"Prepend pi's system prompt (incl. AGENTS.md files) to the first prompt of each new agy conversation.",
			currentValue: config.systemPrompt ? "on" : "off",
			values: ["on", "off"],
		},
	];

	await ui.custom((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(
			new Text(theme.fg("accent", theme.bold("Antigravity provider")), 1, 1),
		);
		const settingsList = new SettingsList(
			items,
			Math.min(items.length + 4, 15),
			getSettingsListTheme(),
			(id, newValue) => {
				if (id === "mode") {
					pending.mode = newValue as AgyMode;
				} else if (id === "readonly") {
					pending.readOnly = newValue === "on";
				} else if (id === "permissions") {
					pending.skipPermissions = newValue === "auto-approved";
				} else if (id === "model") {
					pending.defaultModel = newValue;
				} else if (id === "thinking") {
					pending.defaultThinking = newValue as ThinkingTier;
				} else if (id === "ask") {
					pending.askTool = newValue === "on";
				} else if (id === "web") {
					pending.webTools = newValue === "on";
				} else if (id === "bridge") {
					pending.bridgeTools = newValue as BridgeTools;
				} else if (id === "turn-cap") {
					pending.turnTimeoutMin = Number(newValue);
				} else if (id === "digest") {
					pending.digest = newValue === "on";
				} else if (id === "system-prompt") {
					pending.systemPrompt = newValue === "on";
				}
			},
			() => done(undefined),
		);
		container.addChild(settingsList);

		return {
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				settingsList.handleInput?.(data);
				tui.requestRender();
			},
		};
	});

	if (Object.keys(pending).length === 0) return;

	// The picker cannot switch engines (command-only: /agy engine), but the
	// mode row can still produce plan while the latched engine is acp.
	// Neither engine enforces review-only (#1181); ACP has no plan mode (RC01).
	const nextMode = pending.mode ?? config.mode;
	if (nextMode === "plan" && ctx.engine === "acp") {
		notifyUi(ui,
			"plan cannot be enforced on provider turns on either engine (#1181). /agy mode accept-edits.",
			"warning",
		);
		return;
	}

	try {
		const next = saveConfig(pending);
		const changed = [
			pending.mode ? `mode=${next.mode}` : null,
			pending.readOnly !== undefined ? `readOnly=${next.readOnly ? "on" : "off"}` : null,
			pending.skipPermissions !== undefined
				? `permissions=${next.skipPermissions ? "auto-approved" : "prompt"}`
				: null,
			pending.askTool !== undefined ? `AskAntigravity tool=${next.askTool ? "on" : "off"}` : null,
			pending.webTools !== undefined ? `webTools=${next.webTools ? "on" : "off"}` : null,
			pending.defaultModel !== undefined ? `AskAntigravity model=${next.defaultModel}` : null,
			pending.defaultThinking !== undefined ? `AskAntigravity thinking=${next.defaultThinking}` : null,
			pending.bridgeTools !== undefined ? `bridge=${next.bridgeTools}` : null,
			pending.digest !== undefined ? `digest=${next.digest ? "on" : "off"}` : null,
			pending.systemPrompt !== undefined ? `system-prompt=${next.systemPrompt ? "on" : "off"}` : null,
			pending.turnTimeoutMin !== undefined ? `turn cap=${next.turnTimeoutMin === 0 ? "off" : `${next.turnTimeoutMin}m`}` : null,
		]
			.filter(Boolean)
			.join(", ");
		notifyUi(ui, `Saved: ${changed}`, "info");
	} catch (err) {
		notifyUi(ui,
			`Failed to save config: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	}
}
