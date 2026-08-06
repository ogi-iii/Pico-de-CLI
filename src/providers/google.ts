import { type ContentListUnion, GoogleGenAI, type Part } from "@google/genai";
import type {
	ApiError,
	GenerateParams,
	GenerateTextResult,
	LanguageModel,
	Message,
	Provider,
	ToolCall,
} from "../types";
import { LLMApiError } from "../types";

export function createGoogle(config?: { apiKey?: string }): Provider {
	const client = new GoogleGenAI({
		apiKey: config?.apiKey,
	});

	function convertMessages(messages: Message[]): ContentListUnion {
		return messages
			.filter((m) => m.role !== "system")
			.map((m) => {
				if (m.role === "tool") {
					return {
						role: "user" as const,
						parts: [
							{
								functionResponse: {
									name: m.name,
									response: { result: m.content },
								},
							},
						],
					};
				}
				if (m.role === "assistant" && m.toolCalls) {
					const parts: Part[] = [];
					if (m.content) {
						parts.push({ text: m.content });
					}
					for (const tc of m.toolCalls) {
						parts.push({
							functionCall: {
								name: tc.name,
								args: tc.args,
							},
						});
					}
					return {
						role: "model" as const,
						parts,
					};
				}
				const role = m.role === "assistant" ? "model" : "user";
				return {
					role: role as "user" | "model",
					parts: [
						{
							text: m.content,
						},
					],
				};
			});
	}

	function mapFinishReason(
		reason: string | undefined,
		hasFunctionCall: boolean,
	): GenerateTextResult["finishReason"] {
		if (hasFunctionCall) return "tool_calls";
		switch (reason?.toUpperCase()) {
			case "STOP":
				return "stop";
			case "MAX_TOKENS":
				return "length";
			case "SAFETY":
				return "content_filter";
			default:
				return "stop";
		}
	}

	return (modelId: string): LanguageModel => ({
		async doGenerate(params: GenerateParams): Promise<GenerateTextResult> {
			const systemInstruction = params.messages
				.filter((m) => m.role === "system")
				.map((m) => m.content)
				.join("\n");

			const tools = params.tools?.length
				? [
						{
							functionDeclarations: params.tools.map((tool) => ({
								name: tool.name,
								description: tool.description,
								parameters: tool.parameters,
							})),
						},
					]
				: undefined;

			try {
				const response = await client.models.generateContent({
					model: modelId,
					contents: convertMessages(params.messages),
					config: {
						systemInstruction,
						temperature: params.temperature,
						maxOutputTokens: params.maxTokens,
						...(tools && { tools }),
					},
				});

				const candidate = response.candidates?.[0];
				const parts = candidate?.content?.parts ?? [];

				const text = parts
					.filter((p: Part) => p.text)
					.map((p: Part) => p.text)
					.join("");
				const functionCallParts = parts.filter((p: Part) => p.functionCall);
				const toolCalls: ToolCall[] | undefined =
					functionCallParts.length > 0
						? functionCallParts.map((p: Part, i: number) => ({
								toolCallId: `call_${i}`,
								name: p.functionCall?.name as string,
								args: p.functionCall?.args as Record<string, unknown>,
							}))
						: undefined;

				return {
					text,
					finishReason: mapFinishReason(
						candidate?.finishReason,
						functionCallParts.length > 0,
					),
					toolCalls,
					usage: {
						promptTokens: response.usageMetadata?.promptTokenCount,
						completionTokens: response.usageMetadata?.candidatesTokenCount,
						totalTokens: response.usageMetadata?.totalTokenCount,
					},
				};
			} catch (error: unknown) {
				const err = error as ApiError | undefined;
				throw new LLMApiError(
					err?.status ?? 500,
					"google",
					err?.code ?? undefined,
					err?.message ?? undefined,
					error,
				);
			}
		},
	});
}
