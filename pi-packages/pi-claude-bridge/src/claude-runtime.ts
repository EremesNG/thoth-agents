import type { SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join } from "node:path";

type RuntimeFs = Pick<typeof nodeFs, "linkSync" | "statSync" | "renameSync" | "unlinkSync">;

function isOrcaTerminal(env: NodeJS.ProcessEnv): boolean {
	return Boolean(env.ORCA_PANE_KEY || env.ORCA_TERMINAL_HANDLE);
}

// Orca recognizes descendant agents by executable basename. A neutral sibling
// keeps the same volume and any resources resolved relative to the executable.
export function createClaudeCommandResolver({ fs = nodeFs, env = process.env }: { fs?: RuntimeFs; env?: NodeJS.ProcessEnv } = {}) {
	const memo = new Map<string, string>();
	const isCurrent = (command: string, alias: string): boolean => {
		try {
			const original = fs.statSync(command, { bigint: true });
			const cached = fs.statSync(alias, { bigint: true });
			return cached.dev === original.dev && cached.ino === original.ino;
		} catch { return false; }
	};
	const resolve = (command: string): string => {
		try {
			if (!isOrcaTerminal(env)) return command;
			if (!isAbsolute(command) || !/^claude(?:\.exe)?$/i.test(basename(command))) return command;
			const alias = join(dirname(command), `cc-bridge-runtime${extname(command)}`);
			if (isCurrent(command, alias)) return alias;
			const temporary = join(dirname(command), `.cc-bridge-runtime-${randomUUID()}${extname(command)}`);
			try {
				fs.linkSync(command, temporary);
				if (!isCurrent(command, temporary)) return command;
				fs.renameSync(temporary, alias);
			} catch {
				// Another Pi may have published (and started) the alias on Windows.
			} finally {
				try { fs.unlinkSync(temporary); } catch { /* renamed or never created */ }
			}
			return isCurrent(command, alias) ? alias : command;
		} catch {
			return command;
		}
	};
	// Cache failures too: no repeated filesystem work on subsequent turns.
	return (command: string): string => {
		if (!memo.has(command)) memo.set(command, resolve(command));
		return memo.get(command)!;
	};
}

const resolveClaudeCommand = createClaudeCommandResolver();

function resolveSdkPackage(specifier: string): string {
	const require = createRequire(import.meta.url);
	return createRequire(require.resolve("@anthropic-ai/claude-agent-sdk")).resolve(specifier);
}

function preferMuslBinary(): boolean {
	if (process.platform !== "linux") return false;
	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | null;
	return report != null && report.header?.glibcVersionRuntime === undefined;
}

// Mirrors the SDK 0.3.309 native resolver (not publicly exported). Resolve from
// the SDK entry, not the bridge, so optional packages match the installed SDK.
export function resolveSdkClaudeExecutable({ platform = process.platform, arch = process.arch, preferMusl, resolve = resolveSdkPackage, exists = nodeFs.existsSync }: {
	platform?: string; arch?: string; preferMusl?: boolean;
	resolve?: (specifier: string) => string; exists?: (path: string) => boolean;
} = {}): string | undefined {
	try {
		const prefix = "@anthropic-ai/claude-agent-sdk";
		const linux = `${prefix}-linux-${arch}`;
		let packages = [`${prefix}-${platform}-${arch}`];
		if (platform === "android") packages = [`${linux}-android`];
		else if (platform === "linux") {
			packages = (preferMusl ?? preferMuslBinary()) ? [`${linux}-musl`, linux] : [linux, `${linux}-musl`];
		}
		for (const name of packages) {
			try {
				const executable = resolve(`${name}/claude${platform === "win32" ? ".exe" : ""}`);
				if (exists(executable)) return executable;
			} catch { /* the SDK also tries the next optional package */ }
		}
	} catch { /* leave default resolution to the SDK */ }
	return undefined;
}

export function createAuxiliaryExecutableResolver({
	fs, env = process.env, resolveDefaultExecutable = resolveSdkClaudeExecutable,
	resolveCommand = createClaudeCommandResolver({ fs, env }),
}: {
	fs?: RuntimeFs; env?: NodeJS.ProcessEnv;
	resolveDefaultExecutable?: () => string | undefined;
	resolveCommand?: (command: string) => string;
} = {}) {
	let defaultResolved = false;
	let defaultExecutable: string | undefined;
	return (executable?: string): string | undefined => {
		try {
			if (!isOrcaTerminal(env)) return executable;
			if (!executable && !defaultResolved) {
				defaultResolved = true;
				defaultExecutable = resolveDefaultExecutable();
			}
			const command = executable || defaultExecutable;
			if (!command) return executable;
			const resolved = resolveCommand(command);
			// Do not pin the SDK default when aliasing failed: leave its options alone.
			return resolved === command ? executable : resolved;
		} catch { return executable; }
	};
}

export const resolveAuxiliaryClaudeExecutable = createAuxiliaryExecutableResolver({ resolveCommand: resolveClaudeCommand });

export function spawnClaudeRuntime({ command, args, ...spawnOptions }: SpawnOptions, stderr?: (data: string) => void) {
	const child = spawn(resolveClaudeCommand(command), args, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
	// The provider's custom spawner owns stderr. Consume it even without
	// a callback, and decode across chunks just like the SDK's built-in launcher.
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (data: string) => stderr?.(data));
	return child;
}
