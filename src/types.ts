export type Tool = {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: (args: Record<string, unknown>) => Promise<string>;
	needsApproval?: boolean;
};

export type ToolCall = {
	toolCallId: string;
	name: string;
	args: Record<string, unknown>;
	thoughtSignature?: string;
};

export type ToolResult = {
	toolCallId: string;
	result: string;
};

export type UserMessage = {
	role: "user";
	content: string;
};

export type SystemMessage = {
	role: "system";
	content: string;
};

export type AssistantMessage = {
	role: "assistant";
	content: string;
	toolCalls?: ToolCall[];
};

export type ToolMessage = {
	role: "tool";
	toolCallId: string;
	name: string;
	content: string;
};

export type Message =
	| UserMessage
	| SystemMessage
	| AssistantMessage
	| ToolMessage;

export type GenerateParams = {
	messages: Message[];
	tools?: Tool[];
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
};

export type Usage = {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
};

export type FinishReason =
	| "stop"
	| "length"
	| "content_filter"
	| "tool_calls"
	| "error";

export type GenerateTextResult = {
	text: string;
	finishReason: FinishReason;
	toolCalls?: ToolCall[];
	usage?: Usage;
};

export interface LanguageModel {
	doGenerate(params: GenerateParams): Promise<GenerateTextResult>;
}

export type Provider = (modelId: string) => LanguageModel;

export type GenerateTextParams = GenerateParams & {
	model: LanguageModel;
};

export type ApiError = {
	status?: number;
	code?: string;
	message?: string;
};

export class LLMApiError extends Error {
	constructor(
		public status: number,
		public provider: string,
		public code?: string,
		message?: string,
		public raw?: unknown,
	) {
		super(message || `LLM API Error: ${provider} returned ${status}`);
		this.name = "LLMApiError";
	}
}
