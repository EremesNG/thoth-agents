import { type Api, calculateCost, type Model, type Usage } from "@earendil-works/pi-ai";
import { getModels } from "@earendil-works/pi-ai/compat";

// Keys are normalized Pi model ids, NOT AgyModelEntry.full CLI slugs.
const PRICE_MAPPING = {
	"gemini-3-6-flash": ["google", "gemini-3.6-flash"],
	"gemini-3-7-flash": ["google", "gemini-3.7-flash"],
	"gemini-3-1-pro": ["google", "gemini-3.1-pro-preview"],
	"claude-sonnet-4-6": ["anthropic", "claude-sonnet-4-6"],
	"gpt-oss-120b": ["groq", "openai/gpt-oss-120b"],
	"gpt-oss-120b-low": ["groq", "openai/gpt-oss-120b"],
	"gpt-oss-120b-medium": ["groq", "openai/gpt-oss-120b"],
	"gpt-oss-120b-high": ["groq", "openai/gpt-oss-120b"],
} as const;
// Use the public catalog entrypoint (also used by pi-claude-bridge). Pi's host
// SDK aliases resolve compat imports, but not provider-factory subpaths.
const catalogs = {
	google: getModels("google"),
	anthropic: getModels("anthropic"),
	groq: getModels("groq"),
};
const prices = new Map<string, Model<Api> | undefined>(
	Object.entries(PRICE_MAPPING).map(([id, [provider, catalogId]]) => [
		id,
		catalogs[provider].find((model) => model.id === catalogId),
	]),
);

export type PricingLog = (event: string, data: unknown, level: "warn") => void;
const unpriced = new Set<string>();

export function priceUsage(modelId: string, usage: Usage, log?: PricingLog): void {
	const model = prices.get(modelId);
	if (model) {
		calculateCost(model, usage);
		return;
	}
	usage.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
	if (log && !unpriced.has(modelId)) {
		unpriced.add(modelId);
		log("usage-unpriced", { modelId }, "warn");
	}
}
