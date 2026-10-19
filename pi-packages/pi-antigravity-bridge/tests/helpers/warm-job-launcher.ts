import { JobLauncherUnavailable, launchInJob } from "@thoth-agents/pi-core/windows-job";

/** Pay the per-process PowerShell/Add-Type cold start outside test budgets. */
export async function warmJobLauncher(): Promise<void> {
	if (process.platform !== "win32") return;
	try {
		const job = await launchInJob({
			file: process.execPath,
			args: ["-e", ""],
			cwd: process.cwd(),
			env: process.env,
		});
		try {
			job.stdout.resume();
			job.stderr.resume();
			job.stdin.end();
			await job.exited;
		} finally {
			try {
				await job.terminate(5_000);
			} finally {
				await job.release();
			}
		}
	} catch (error) {
		// The facade falls back to plain spawn when jobs are unavailable.
		if (!(error instanceof JobLauncherUnavailable)) throw error;
	}
}
