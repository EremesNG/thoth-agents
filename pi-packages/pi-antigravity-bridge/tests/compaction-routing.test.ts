import { expect, test } from "vitest";
import { routeCompaction, type CompactionRouting, type CompactionAction } from "../src/compaction-routing.js";

type TailReplay = `${CompactionRouting["tail"]}/${CompactionRouting["replay"]}`;
const expected: Record<CompactionRouting["handoff"], Record<TailReplay, CompactionAction>> = {
	none: {
		"user/none": "ordinary-unrotated", "user/live-owner": "re-enter-live-owner",
		"user/inactive-older-generation": "ordinary-unrotated", "user/inactive-current-generation": "ordinary-unrotated",
		"tool-result/none": "ordinary-unrotated", "tool-result/live-owner": "re-enter-live-owner",
		"tool-result/inactive-older-generation": "ordinary-unrotated", "tool-result/inactive-current-generation": "ordinary-unrotated",
	},
	pending: {
		"user/none": "claim-fresh-handoff", "user/live-owner": "claim-fresh-handoff",
		"user/inactive-older-generation": "claim-fresh-handoff", "user/inactive-current-generation": "claim-fresh-handoff",
		"tool-result/none": "claim-fresh-handoff", "tool-result/live-owner": "re-enter-live-owner",
		"tool-result/inactive-older-generation": "claim-fresh-handoff", "tool-result/inactive-current-generation": "replay-current-tail",
	},
	"claimed-by-self": {
		"user/none": "continue-owned-handoff", "user/live-owner": "continue-owned-handoff",
		"user/inactive-older-generation": "continue-owned-handoff", "user/inactive-current-generation": "continue-owned-handoff",
		"tool-result/none": "continue-owned-handoff", "tool-result/live-owner": "re-enter-live-owner",
		"tool-result/inactive-older-generation": "continue-owned-handoff", "tool-result/inactive-current-generation": "continue-owned-handoff",
	},
	"claimed-by-other": {
		"user/none": "refuse-retry", "user/live-owner": "refuse-retry",
		"user/inactive-older-generation": "refuse-retry", "user/inactive-current-generation": "refuse-retry",
		"tool-result/none": "refuse-retry", "tool-result/live-owner": "re-enter-live-owner",
		"tool-result/inactive-older-generation": "refuse-retry", "tool-result/inactive-current-generation": "refuse-retry",
	},
	committed: {
		"user/none": "ordinary-bound-suppress-checkpoint", "user/live-owner": "re-enter-live-owner",
		"user/inactive-older-generation": "ordinary-bound-suppress-checkpoint", "user/inactive-current-generation": "replay-current-tail",
		"tool-result/none": "ordinary-bound-suppress-checkpoint", "tool-result/live-owner": "re-enter-live-owner",
		"tool-result/inactive-older-generation": "ordinary-bound-suppress-checkpoint", "tool-result/inactive-current-generation": "replay-current-tail",
	},
};

const cases = (Object.entries(expected) as Array<[CompactionRouting["handoff"], Record<TailReplay, CompactionAction>]>).flatMap(([handoff, routes]) =>
	Object.entries(routes).flatMap(([pair, action]) => {
		const [tail, replay] = pair.split("/") as [CompactionRouting["tail"], CompactionRouting["replay"]];
		return [false, true].flatMap(digest => [false, true].map(retryAfterError => ({ handoff, tail, replay, digest, retryAfterError, action })));
	}));

test.each(cases)("$handoff $tail/$replay digest=$digest retry=$retryAfterError → $action", ({ action, ...input }) => {
	expect(routeCompaction(input)).toBe(action);
	// A replay action only drains an already executed call; it is never a new tool dispatch.
	if (input.replay === "live-owner" && (input.handoff === "none" || input.handoff === "committed" || input.tail === "tool-result")) expect(action).toBe("re-enter-live-owner");
	if (input.replay === "inactive-older-generation" && input.handoff !== "none") expect(action).not.toMatch(/replay|re-enter/);
	if (input.handoff === "committed") expect(action).not.toMatch(/handoff|unrotated/);
	if (input.handoff === "claimed-by-other") expect(action).not.toMatch(/claim-fresh|continue-owned/);
});

test("a registry-only pass cannot consume a pending checkpoint or bypass someone else's claim", () => {
	const input = { tail: "tool-result", replay: "none", digest: true, registryOnly: true } as const;
	expect(routeCompaction({ ...input, handoff: "pending" })).toBe("settle-registry-only");
	expect(routeCompaction({ ...input, handoff: "committed" })).toBe("settle-registry-only");
	expect(routeCompaction({ ...input, handoff: "none" })).toBe("settle-registry-only");
	expect(routeCompaction({ ...input, handoff: "claimed-by-other" })).toBe("refuse-retry");
});
