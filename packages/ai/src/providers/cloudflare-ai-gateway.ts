import { getEnvApiKey } from "../env-api-keys.js";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
} from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { streamOpenAICompletions } from "./openai-completions.js";

export interface CloudflareAIGatewayOptions extends StreamOptions {
	/** Override the Cloudflare account ID (defaults to CLOUDFLARE_ACCOUNT_ID env var) */
	accountId?: string;
	/** Override the gateway ID (defaults to CLOUDFLARE_GATEWAY_ID env var, or "default") */
	gatewayId?: string;
}

function resolveAccountId(options?: CloudflareAIGatewayOptions): string | undefined {
	return options?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
}

function resolveGatewayId(options?: CloudflareAIGatewayOptions): string {
	return options?.gatewayId || process.env.CLOUDFLARE_GATEWAY_ID || "default";
}

function resolveApiToken(): string | undefined {
	return getEnvApiKey("cloudflare-ai-gateway");
}

function buildBaseUrl(accountId: string, gatewayId: string): string {
	return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;
}

function createErrorMessage(model: Model<"cloudflare-ai-gateway">, errorMessage: string): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "cloudflare-ai-gateway" as Api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		errorMessage,
		timestamp: Date.now(),
	};
}

/**
 * Stream function for Cloudflare AI Gateway.
 *
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.
 * CLOUDFLARE_GATEWAY_ID is optional (defaults to "default").
 */
export const streamCloudflareAIGateway: StreamFunction<"cloudflare-ai-gateway", CloudflareAIGatewayOptions> = (
	model: Model<"cloudflare-ai-gateway">,
	context: Context,
	options?: CloudflareAIGatewayOptions,
): AssistantMessageEventStream => {
	const accountId = resolveAccountId(options);
	const gatewayId = resolveGatewayId(options);
	const apiToken = resolveApiToken();

	if (!accountId) {
		const stream = new AssistantMessageEventStream();
		const error = createErrorMessage(
			model,
			"CLOUDFLARE_ACCOUNT_ID is required. Set it via environment variable or pass it as an option.",
		);
		stream.push({ type: "error", reason: "error", error });
		stream.end(error);
		return stream;
	}

	if (!apiToken) {
		const stream = new AssistantMessageEventStream();
		const error = createErrorMessage(
			model,
			"CLOUDFLARE_API_TOKEN is required for Cloudflare AI Gateway. Set it via environment variable.",
		);
		stream.push({ type: "error", reason: "error", error });
		stream.end(error);
		return stream;
	}

	// Build the base URL for this gateway
	const baseUrl = buildBaseUrl(accountId, gatewayId);

	// Create a modified model with the gateway base URL for OpenAI completions
	const gatewayModel: Model<"openai-completions"> = {
		id: model.id,
		name: model.name,
		api: "openai-completions",
		provider: model.provider,
		baseUrl,
		reasoning: model.reasoning,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		headers: model.headers,
		compat: model.compat,
	};

	// Pass through to OpenAI completions with the CF token as the API key.
	// The OpenAI SDK sends this as Authorization: Bearer {token}, which the
	// gateway accepts for BYOK/unified billing.
	return streamOpenAICompletions(gatewayModel, context, {
		...options,
		apiKey: apiToken,
	});
};

/**
 * Simple stream function for Cloudflare AI Gateway.
 */
export const streamSimpleCloudflareAIGateway: StreamFunction<"cloudflare-ai-gateway", SimpleStreamOptions> = (
	model,
	context,
	options,
) => {
	return streamCloudflareAIGateway(model, context, options);
};
