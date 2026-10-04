export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "0s";
	if (ms < 1000) return `${Math.floor(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`;
	const totalMinutes = Math.floor(ms / 60_000);
	if (ms < 3_600_000) {
		const seconds = Math.floor(ms / 1000) % 60;
		return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
	}
	const hours = Math.floor(ms / 3_600_000);
	return `${hours}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}
