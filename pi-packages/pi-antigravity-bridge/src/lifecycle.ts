/** Diagnostics and lifecycle listeners must never escape a Node callback or
 * interrupt cleanup. Startup callers may route a captured synchronous failure
 * through their owned rollback; asynchronous sink rejections are always ignored. */
export function emitLifecycle(emit: () => unknown): { error: unknown } | undefined {
	try {
		const result = emit();
		// A void-typed sink can still be async (or return a thenable).
		if (result !== null && (typeof result === "object" || typeof result === "function")) {
			void Promise.resolve(result).catch(() => {});
		}
		return undefined;
	} catch (error) {
		return { error };
	}
}
