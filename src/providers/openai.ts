import OpenAI from "openai";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionMessageParam,
	ChatCompletionSystemMessageParam,
	ChatCompletionToolMessageParam,
	ChatCompletionUserMessageParam,
} from "openai/resources";
import {
	type ApiError,
	type AssistantMessage,
	type FinishReason,
	type GenerateParams,
	type GenerateTextResult,
	type LanguageModel,
	LLMApiError,
	type Message,
	type Provider,
	type SystemMessage,
	type ToolCall,
	type ToolMessage,
	type UserMessage,
} from "../types";

const convertToolMessage = (m: ToolMessage) => ({
	role: m.role,
	tool_call_id: m.toolCallId,
	content: m.content,
});

const convertAssistantMessage = (m: AssistantMessage) => ({
	role: m.role,
	content: m.content,
	...(m.toolCalls &&
		m.toolCalls.length > 0 && {
			tool_calls: m.toolCalls.map((tc) => ({
				id: tc.toolCallId,
				type: "function" as const,
				function: {
					name: tc.name,
					arguments: JSON.stringify(tc.args),
				},
			})),
		}),
});

const convertUserMessage = (m: UserMessage) => m;

const convertSystemMessage = (m: SystemMessage) => m;

type MessageConverters = {
	tool: (m: ToolMessage) => ChatCompletionToolMessageParam;
	assistant: (m: AssistantMessage) => ChatCompletionAssistantMessageParam;
	user: (m: UserMessage) => ChatCompletionUserMessageParam;
	system: (m: SystemMessage) => ChatCompletionSystemMessageParam;
};

const messageConverters: MessageConverters = {
	tool: convertToolMessage,
	assistant: convertAssistantMessage,
	user: convertUserMessage,
	system: convertSystemMessage,
} as const;

function convertMessages(
	messages: Message[],
): Array<ChatCompletionMessageParam> {
	return messages.map((m) => {
		const converter = messageConverters[m.role] as (
			m: Message,
		) => ChatCompletionMessageParam;
		return converter(m);
	});
}

const validFinishReasons = [
	"stop",
	"length",
	"content_filter",
	"tool_calls",
] as const;

function mapFinishReason(reason: string | null): FinishReason {
	return reason && (validFinishReasons as readonly string[]).includes(reason)
		? (reason as FinishReason)
		: "stop";
}

export function createOpenAI(config?: {
	apiKey?: string;
	baseURL?: string;
	maxRetries?: number;
}): Provider {
	const client = new OpenAI({
		apiKey: config?.apiKey,
		baseURL: config?.baseURL?.replace(/\/chat\/completions\/?$/, ""),
		maxRetries: config?.maxRetries ?? 0,
	});

	return (modelId: string): LanguageModel => ({
		async doGenerate(params: GenerateParams): Promise<GenerateTextResult> {
			const tools = params.tools?.map((tool) => ({
				type: "function" as const,
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters,
				},
			}));

			try {
				const completion = await client.chat.completions.create(
					{
						model: modelId,
						messages: convertMessages(params.messages),
						temperature: params.temperature,
						max_completion_tokens: params.maxTokens,
						...(tools && tools.length > 0 && { tools }),
					},
					{
						signal: params.signal,
					},
				);

				const choice = completion.choices[0];
				if (!choice) {
					throw new LLMApiError(
						500,
						"openai",
						undefined,
						"There is no response from OpenAI chat completions API.",
					);
				}
				const message = choice.message;

				const toolCalls: ToolCall[] | undefined = message.tool_calls
					?.filter((tc) => tc.type === "function") // expects only function tool calls
					.map((tc) => ({
						toolCallId: tc.id,
						name: tc.function.name,
						args: ((argsText) => {
							try {
								return argsText ? JSON.parse(argsText) : {};
							} catch {
								return {};
							}
						})(tc.function.arguments), // safely parse and fall back to an empty object for malformed JSON
					}));

				return {
					text: message.content ?? "",
					finishReason: mapFinishReason(choice.finish_reason),
					toolCalls,
					usage: {
						promptTokens: completion.usage?.prompt_tokens,
						completionTokens: completion.usage?.completion_tokens,
						totalTokens: completion.usage?.total_tokens,
					},
				};
			} catch (error: unknown) {
				const err = error as ApiError | undefined;
				throw new LLMApiError(
					err?.status ?? 500,
					"openai",
					err?.code ?? undefined,
					err?.message ?? undefined,
					error,
				);
			}
		},
	});
}
