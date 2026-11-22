export interface CompactionRouting {
	handoff: "none" | "pending" | "claimed-by-self" | "claimed-by-other" | "committed";
	tail: "user" | "tool-result";
	replay: "none" | "live-owner" | "inactive-older-generation" | "inactive-current-generation";
	digest: boolean;
	/** Completion-only pass for result bookkeeping, not model input. */
	registryOnly?: boolean;
	/** Pi does not expose retry provenance on every provider call. */
	retryAfterError?: boolean;
}

export type CompactionAction = "re-enter-live-owner" | "replay-current-tail" | "claim-fresh-handoff" |
	"continue-owned-handoff" | "settle-registry-only" | "refuse-retry" | "ordinary-bound-suppress-checkpoint" | "ordinary-unrotated";

/** Digest policy and retry provenance never override ownership. A current
 * replay tail may still have unread output (e.g. a park without a known ID). */
export function routeCompaction({ handoff, tail, replay, registryOnly }: CompactionRouting): CompactionAction {
	if (replay === "live-owner" && (handoff === "none" || handoff === "committed" || tail === "tool-result")) return "re-enter-live-owner";
	if (handoff === "claimed-by-self") return "continue-owned-handoff";
	if (handoff === "claimed-by-other") return "refuse-retry";
	if (registryOnly && tail === "tool-result" && replay === "none") return "settle-registry-only";
	if (handoff === "none") return "ordinary-unrotated";
	if ((handoff === "committed" || tail === "tool-result") && replay === "inactive-current-generation") return "replay-current-tail";
	return handoff === "pending" ? "claim-fresh-handoff" : "ordinary-bound-suppress-checkpoint";
}
