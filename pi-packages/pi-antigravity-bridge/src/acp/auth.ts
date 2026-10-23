import { AcpAuthError, AcpConnection } from "./connection.js";
import { clearAcpAuthVerified, hasAcpToken, writeAcpAuthVerified } from "./setup.js";

// Explicit sign-in (/agy auth): spawn a short-lived server, send
// `authenticate` (the RPC that fires the loopback listener + browser OAuth
// flow), and wait for the token to land in the shared acp_token.json. A
// dedicated process keeps the minutes-scale login ritual away from live
// turns; the next driver connection picks the token up. The real server
// blocks until the browser round-trip completes; the observed window is
// minutes-scale (one flow timed out at ~8.5 minutes), so the timeout is
// generous. Some servers use existing credentials without writing a token;
// a live session/new probe verifies that tokenless branch on this connection.

export const AUTH_TIMEOUT_MS = 10 * 60_000;

export interface AcpAuthOptions {
	bin: string;
	binArgs?: string[];
	cwd?: string;
	extraEnv?: Record<string, string>;
	authUrlFile?: string;
	/** Directory holding acp_token.json. Default: ~/.gemini/antigravity-acp.
	 *  Tests point this at a fixture dir; production callers use the default. */
	tokenDir?: string;
	/** The server is expected to have written acp_token.json by the time
	 *  authenticate replies, but write-after-reply is unverified; after a
	 *  successful reply the run polls for the token up to this long before
	 *  SIGTERM, so a laggard write is never killed mid-flight. A token that
	 *  never appears is verified with a live session probe. */
	tokenGraceMs?: number;
	/** Bridge-side sign-in evidence; never contains a credential. */
	authVerifiedFile?: string;
	/** Owning bridge callback. Defaults to clearing authVerifiedFile. */
	onAuthInvalidated?: () => void;
	timeoutMs?: number;
	log?: (msg: string, data?: unknown) => void;
}

export interface AcpAuthResult {
	ok: boolean;
	/** Tokenless sign-in was verified with a live session probe. */
	note?: string;
	/** Failure reason (spawn, timeout, -32000 family, concurrent run). Absent when ok. */
	error?: string;
}

let authInFlight: Promise<AcpAuthResult> | null = null;

export function runAcpAuth(opts: AcpAuthOptions): Promise<AcpAuthResult> {
	const conn = new AcpConnection({
		bin: opts.bin,
		binArgs: opts.binArgs,
		cwd: opts.cwd ?? process.cwd(),
		extraEnv: opts.extraEnv,
		authUrlFile: opts.authUrlFile,
		onAuthInvalidated: opts.onAuthInvalidated ?? (() => clearAcpAuthVerified(opts.authVerifiedFile)),
		log: opts.log ?? (() => {}),
		onUpdate: () => {},
		onExit: () => {},
	});
	const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
	const grace = opts.tokenGraceMs ?? 5_000;
	const run = async (): Promise<AcpAuthResult> => {
		try {
			await conn.start();
			await conn.request("authenticate", { methodId: "oauth-personal" }, opts.timeoutMs ?? AUTH_TIMEOUT_MS);
			const deadline = Date.now() + grace;
			while (!hasAcpToken(opts.tokenDir) && Date.now() < deadline) await sleep(200);
			const result: AcpAuthResult = { ok: true };
			if (!hasAcpToken(opts.tokenDir)) {
				try {
					const session = await conn.newSession(opts.cwd ?? process.cwd());
					await conn.closeSession(session.sessionId).catch((err: unknown) => {
						// Cleanup is best effort, but an auth error must not be
						// overwritten by recording a new verified marker below.
						if (err instanceof AcpAuthError) throw err;
					});
				} catch {
					return {
						ok: false,
						error: `the server accepted the sign-in but holds no usable credentials (session probe failed; token file absent in ${opts.tokenDir ?? "~/.gemini/antigravity-acp"}). Finish the Google sign-in if a browser opened, then retry /agy auth.`,
					};
				}
				result.note = "the server authenticated from existing credentials; no browser sign-in was needed";
			}
			writeAcpAuthVerified(opts.authVerifiedFile);
			return result;
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		} finally {
			await conn.kill();
		}
	};
	// One sign-in at a time: two concurrent runs would race the OAuth loopback
	// and the token write. A second invocation fails fast instead.
	if (authInFlight) return Promise.resolve({ ok: false, error: "a sign-in is already running; wait for it to finish" });
	authInFlight = run();
	return authInFlight.finally(() => {
		authInFlight = null;
	});
}
