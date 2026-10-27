import { createHash, randomUUID } from "node:crypto";
import * as nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveWindowsExecutable } from "./windows-executable.js";

type RuntimeFs = Pick<typeof nodeFs, "statSync" | "mkdirSync" | "linkSync" | "renameSync" | "unlinkSync" | "openSync" | "readSync" | "closeSync">;

/** Shared Pi-owned base for the catalog cache and neutral runtime hardlinks. */
export function antigravityBridgeDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "antigravity-bridge");
}

function resolveExecutable(command: string, env: NodeJS.ProcessEnv, cwd: string, fs: RuntimeFs): string | undefined {
	// Match the owned launcher and Node's shell:false lookup, not shell PATHEXT.
	if (process.platform === "win32") return resolveWindowsExecutable(command, cwd, env);
	if (command.includes("/")) return path.resolve(cwd, command);
	for (const directory of (env.PATH ?? "/usr/bin:/bin").split(path.delimiter)) {
		const candidate = path.resolve(cwd, directory, command);
		try {
			const stat = fs.statSync(candidate);
			if (stat.isFile() && (stat.mode & 0o111) !== 0) return candidate;
		} catch { /* next PATH candidate */ }
	}
	return undefined;
}

function isNativeExecutable(file: string, fs: RuntimeFs): boolean {
	const descriptor = fs.openSync(file, "r");
	try {
		const header = Buffer.alloc(4);
		if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) return false;
		if (process.platform === "win32") return header[0] === 0x4d && header[1] === 0x5a;
		return ["7f454c46", "feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(header.toString("hex"));
	} finally { fs.closeSync(descriptor); }
}

/** Orca identifies descendant agents by executable basename. Only native agy
 *  binaries can safely run away from their install directory; shims fail open. */
export function createAgyCommandResolver({ fs = nodeFs, env = process.env, runtimeDir }: {
	fs?: RuntimeFs; env?: NodeJS.ProcessEnv; runtimeDir?: string;
} = {}) {
	const memo = new Map<string, string>();
	return (command: string, spawnEnv: NodeJS.ProcessEnv = env, cwd: string = process.cwd()): string => {
		try {
			if (!spawnEnv.ORCA_PANE_KEY && !spawnEnv.ORCA_TERMINAL_HANDLE) return command;
			const executable = resolveExecutable(command, spawnEnv, cwd, fs);
			if (!executable || !/^agy(?:\.exe)?$/i.test(path.basename(executable))) return command;
			const source = fs.statSync(executable, { bigint: true });
			const identity = `${source.dev}:${source.ino}`;
			const key = `${command}\0${executable}\0${identity}`;
			const isCurrent = (file: string): boolean => {
				try {
					const current = fs.statSync(executable, { bigint: true });
					const linked = fs.statSync(file, { bigint: true });
					return current.dev === source.dev && current.ino === source.ino && linked.dev === source.dev && linked.ino === source.ino;
				} catch { return false; }
			};
			const cached = memo.get(key);
			if (cached !== undefined && (cached === command || isCurrent(cached))) return cached;
			if (!source.isFile() || !isNativeExecutable(executable, fs)) return command;
			// An update gets a new directory: never replace an old, running Windows exe.
			const directory = path.join(runtimeDir ?? path.join(antigravityBridgeDir(), "runtime"), createHash("sha256").update(identity).digest("hex"));
			const alias = path.join(directory, `ag-bridge-runtime${process.platform === "win32" ? ".exe" : ""}`);
			if (!isCurrent(alias)) {
				const temporary = path.join(directory, `.ag-bridge-runtime-${randomUUID()}`);
				try {
					fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
					fs.linkSync(executable, temporary);
					if (isCurrent(temporary)) fs.renameSync(temporary, alias);
				} catch {
					// Another Pi may have published and started the alias on Windows.
				} finally {
					try { fs.unlinkSync(temporary); } catch { /* renamed or never created */ }
				}
			}
			const result = isCurrent(alias) ? alias : command;
			memo.set(key, result); // Cache failures too, until the source identity changes.
			return result;
		} catch { return command; }
	};
}

export const resolveAgyCommand = createAgyCommandResolver();
