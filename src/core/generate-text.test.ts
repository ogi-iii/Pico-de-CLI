import { describe, expect, it, mock } from "bun:test";
import type {
	GenerateTextParams,
	GenerateTextResult,
	LanguageModel,
} from "../types";
import { generateText } from "./generate-text";

describe("generateText", () => {
	it("should pass parameters to model.doGenerate and return the result", async () => {
		const expectedResult: GenerateTextResult = {
			text: "Hello, world!",
			finishReason: "stop",
		};

		const mockDoGenerate = mock().mockResolvedValue(expectedResult);
		const mockModel: LanguageModel = {
			doGenerate: mockDoGenerate,
		} as unknown as LanguageModel;

		const abortController = new AbortController();
		const params: GenerateTextParams = {
			model: mockModel,
			messages: [{ role: "user", content: "Hi" }],
			tools: Object.values({
				dummyTool: {
					name: "dummyTool",
					description: "A dummy tool",
					parameters: {},
					execute: async () => "ok",
				},
			}),
			temperature: 0.7,
			maxTokens: 100,
			signal: abortController.signal,
		};

		const result = await generateText(params);

		expect(mockDoGenerate).toHaveBeenCalledTimes(1);
		expect(mockDoGenerate).toHaveBeenCalledWith({
			messages: params.messages,
			tools: params.tools,
			temperature: params.temperature,
			maxTokens: params.maxTokens,
			signal: params.signal,
		});

		expect(result).toBe(expectedResult);
	});

	it("should handle optional parameters as undefined when omitted", async () => {
		const expectedResult: GenerateTextResult = {
			text: "Response without optional params",
			finishReason: "stop",
		};

		const mockDoGenerate = mock().mockResolvedValue(expectedResult);
		const mockModel: LanguageModel = {
			doGenerate: mockDoGenerate,
		} as unknown as LanguageModel;

		const params: GenerateTextParams = {
			model: mockModel,
			messages: [{ role: "user", content: "Test" }],
		};

		const result = await generateText(params);

		expect(mockDoGenerate).toHaveBeenCalledWith({
			messages: params.messages,
			tools: undefined,
			temperature: undefined,
			maxTokens: undefined,
			signal: undefined,
		});

		expect(result).toEqual(expectedResult);
	});

	it("should propagate errors thrown by model.doGenerate", async () => {
		const mockError = new Error("Model generation failed");
		const mockDoGenerate = mock().mockRejectedValue(mockError);
		const mockModel: LanguageModel = {
			doGenerate: mockDoGenerate,
		} as unknown as LanguageModel;

		const params: GenerateTextParams = {
			model: mockModel,
			messages: [{ role: "user", content: "Error test" }],
		};

		expect(generateText(params)).rejects.toThrow("Model generation failed");
	});
});
