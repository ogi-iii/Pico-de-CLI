export type Tool = {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: (args: Record<string, unknown>) => Promise<string>;
};

export type ToolCall = {
	toolCallId: string;
	name: string;
	args: Record<string, unknown>;
};

export type ToolResult = {
	toolCallId: string;
	result: string;
};

export type Message =
	| {
			role: "user" | "system";
			content: string;
	  }
	| {
			role: "assistant";
			content: string;
			toolCalls?: ToolCall[];
	  }
	| {
			role: "tool";
			toolCallId: string;
			name: string;
			content: string;
	  };

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

export type GenerateTextResult = {
	text: string;
	finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "error";
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
