export const DEFAULT_WAIT_TIMEOUT_MS = 120_000;

/** Absolute deadline for a named startup/queue wait, not a turn deadline.
 * Zero disables the cap. The underlying work must fence any late launch. */
export async function waitWithDeadline<T>(work: PromiseLike<T>, ms: number, name: string): Promise<T> {
	if (ms <= 0) return work;
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`agy ${name} wait exceeded ${ms}ms deadline`)), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
