import type { GenerateTextParams, GenerateTextResult } from "../types";

export async function generateText(
	params: GenerateTextParams,
): Promise<GenerateTextResult> {
	return await params.model.doGenerate({
		messages: params.messages,
		tools: params.tools,
		temperature: params.temperature,
		maxTokens: params.maxTokens,
		signal: params.signal,
	});
}
