import { statSync } from "node:fs";

function environment(env: NodeJS.ProcessEnv, name: string): string | undefined {
	const key = Object.keys(env).sort().find((key) => key.toUpperCase() === name.toUpperCase());
	return key === undefined ? undefined : env[key];
}

/** Port of search_path, path_search_walk_ext and search_path_join_test (no
 * FILE_PATH_EXACT_NAME, as in Node):
 * https://github.com/libuv/libuv/blob/v1.52.0/src/win/process.c
 * Deliberately not PATHEXT / shell / fs.access executable permission checking. */
export function resolveWindowsExecutable(file: string, cwd: string, env: NodeJS.ProcessEnv): string {
	const missing = () => Object.assign(new Error(`spawn ${file} ENOENT`), { code: "ENOENT", errno: -4058, syscall: `spawn ${file}`, path: file });
	if (!file || file === ".") throw missing();
	const split = Math.max(file.lastIndexOf("\\"), file.lastIndexOf("/"), file.lastIndexOf(":")) + 1;
	const name = file.slice(split);
	const dot = name.indexOf(".");
	const extensions = dot !== -1 && dot + 1 < name.length ? ["", "com", "exe"] : ["com", "exe"];
	const walk = (directory: string): string | undefined => {
		// Preserve libuv's drive-relative behavior: same-drive C: uses cwd,
		// a different drive is left drive-relative (no per-drive cwd lookup).
		let base = cwd;
		if (/^[\\/]/.test(directory)) {
			base = directory.length > 2 && /^[\\/]{2}/.test(directory) ? "" : cwd.slice(0, 2);
		} else if (/^[^:]:/.test(directory)) {
			if (directory.length > 2 && /^[\\/]/.test(directory.slice(2))) base = "";
			else if (cwd.slice(0, 2).toLowerCase() === directory.slice(0, 2).toLowerCase()) directory = directory.slice(2);
			else base = "";
		}
		const separator = (text: string) => text && !/[\\/:]$/.test(text) ? `${text}\\` : text;
		for (const ext of extensions) {
			const candidate = `${separator(base)}${separator(directory)}${name}${ext ? `${name.endsWith(".") ? "" : "."}${ext}` : ""}`;
			try { if (!statSync(candidate).isDirectory()) return candidate; } catch { /* skip inaccessible candidates like GetFileAttributesW */ }
		}
		return undefined;
	};
	if (split) {
		const result = walk(file.slice(0, split));
		if (result) return result;
	} else {
		if (environment(process.env, "NoDefaultCurrentDirectoryInExePath") === undefined) {
			const result = walk("");
			if (result) return result;
		}
		// libuv uses the parent PATH when the child environment has none.
		const path = environment(env, "PATH") ?? environment(process.env, "PATH") ?? "";
		let end = 0;
		while (end < path.length) {
			if (end !== 0 || path[0] === ";") end++;
			const start = end;
			if (path[start] === '"' || path[start] === "'") {
				const quote = path.indexOf(path[start], start + 1);
				end = quote === -1 ? path.length : quote;
			}
			const semicolon = path.indexOf(";", end);
			end = semicolon === -1 ? path.length : semicolon;
			if (end === start) continue;
			let directory = path.slice(start, end);
			if (/^["']/.test(directory)) directory = directory.slice(1);
			if (/["']$/.test(directory)) directory = directory.slice(0, -1);
			const result = walk(directory);
			if (result) return result;
		}
	}
	throw missing();
}
