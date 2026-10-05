import type { DriverTurnRequest, TurnHandle } from "./driver-types.js";
import { DEFAULT_WAIT_TIMEOUT_MS, waitWithDeadline } from "./waits.js";

/** Serializes entire turn lifetimes, including parks. Expiring a requester
 * releases only its slot; the tail still waits for the predecessor. */
export class TurnQueue {
	#tail: Promise<void> = Promise.resolve();

	async run(request: DriverTurnRequest, launch: () => Promise<TurnHandle>): Promise<TurnHandle> {
		const predecessor = this.#tail;
		let release!: () => void;
		const slot = new Promise<void>(resolve => { release = resolve; });
		this.#tail = predecessor.then(() => slot);
		try {
			// No launch callback is attached to predecessor: once this await
			// rejects, the expired requester can never launch later.
			await waitWithDeadline(predecessor, request.queueTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, "run queue");
			request.assertCurrent?.();
			const handle = await launch();
			void handle.outcome.then(release, release);
			return handle;
		} catch (error) {
			release();
			throw error;
		}
	}
}
