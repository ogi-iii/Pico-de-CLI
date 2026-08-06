import { type Content, GoogleGenAI, type Part } from "@google/genai";
import type {
	ApiError,
	AssistantMessage,
	FinishReason,
	GenerateParams,
	GenerateTextResult,
	LanguageModel,
	Message,
	Provider,
	ToolCall,
	ToolMessage,
	UserMessage,
} from "../types";
import { LLMApiError } from "../types";

const convertToolMessage = (m: ToolMessage) => ({
	role: "user" as const,
	parts: [
		{
			functionResponse: {
				name: m.name,
				response: { result: m.content },
			},
		},
	],
});

const convertAssistantMessage = (m: AssistantMessage) => ({
	role: "model" as const,
	parts: [
		...(m.content ? [{ text: m.content }] : []),
		...(m.toolCalls?.map((tc) => ({
			functionCall: {
				name: tc.name,
				args: tc.args,
			},
		})) ?? []),
	],
});

const convertUserMessage = (m: UserMessage) => ({
	role: "user" as const,
	parts: [{ text: m.content }],
});

type MessageConverters = {
	tool: (m: ToolMessage) => Content;
	assistant: (m: AssistantMessage) => Content;
	user: (m: UserMessage) => Content;
};

const messageConverters: MessageConverters = {
	tool: convertToolMessage,
	assistant: convertAssistantMessage,
	user: convertUserMessage,
};

function convertMessages(messages: Message[]): Content[] {
	return messages
		.filter((m) => m.role !== "system")
		.map((m) => {
			const convert = messageConverters[m.role as keyof MessageConverters];
			return convert(m as never);
		});
}

const finishReasonMap: Record<string, FinishReason> = {
	stop: "stop",
	max_tokens: "length",
	safety: "content_filter",
};

function mapFinishReason(reason: string | undefined): FinishReason {
	return finishReasonMap[reason?.toLowerCase() ?? ""] ?? "stop";
}

export function createGoogle(config?: { apiKey?: string }): Provider {
	const client = new GoogleGenAI({
		apiKey: config?.apiKey,
	});

	return (modelId: string): LanguageModel => ({
		async doGenerate(params: GenerateParams): Promise<GenerateTextResult> {
			const systemInstruction =
				params.messages
					.filter((m) => m.role === "system")
					.map((m) => m.content)
					.join("\n") || undefined;

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

				const text = parts.map((p: Part) => p.text ?? "").join("");
				const functionCallParts = parts.filter((p: Part) => p.functionCall);
				const toolCalls: ToolCall[] | undefined = functionCallParts.length
					? functionCallParts.map((p: Part, i: number) => ({
							toolCallId: `call_${i}`,
							name: p.functionCall?.name ?? "",
							args: (p.functionCall?.args as Record<string, unknown>) ?? {},
						}))
					: undefined;

				return {
					text,
					finishReason: toolCalls?.length
						? "tool_calls"
						: mapFinishReason(candidate?.finishReason),
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
