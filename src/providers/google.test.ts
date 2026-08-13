import { beforeEach, describe, expect, it, mock } from "bun:test";
import { LLMApiError } from "../types";
import { createGoogle } from "./google";

const mockGenerateContent = mock();

mock.module("@google/genai", () => {
	return {
		GoogleGenAI: class {
			models = {
				generateContent: mockGenerateContent,
			};
		},
	};
});

describe("createGoogle", () => {
	beforeEach(() => {
		mockGenerateContent.mockClear();
	});

	it("should correctly convert messages to Gemini API format and send them", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [
				{
					content: {
						parts: [{ text: "Hello!" }],
					},
					finishReason: "STOP",
				},
			],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(result.text).toBe("Hello!");
		expect(result.finishReason).toBe("stop");
		expect(mockGenerateContent).toHaveBeenCalledTimes(1);
	});

	it("should correctly convert assistant messages with and without tool calls", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [{ content: { parts: [{ text: "OK" }] } }],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string ?? "gemini-3.5-flash-lite");

		await model.doGenerate({
			messages: [
				{ role: "assistant", content: "I am ready to help." },
				{
					role: "assistant",
					content: "Searching...",
					toolCalls: [
						{
							toolCallId: "call_123",
							name: "searchWeb",
							args: { query: "bun test" },
						},
					],
				},
			],
		});

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({
				config: {
					maxOutputTokens: undefined,
					systemInstruction: undefined,
					temperature: undefined,
				},
				contents: [
					{
						role: "model",
						parts: [{ text: "I am ready to help." }],
					},
					{
						role: "model",
						parts: [
							{ text: "Searching..." },
							{
								functionCall: {
									name: "searchWeb",
									args: { query: "bun test" },
									id: "call_123",
								},
								thoughtSignature: undefined,
							},
						],
					},
				],
				model: "gemini-3.5-flash-lite",
			}),
		);
	});

	it("should correctly convert tool messages into functionResponse format", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [{ content: { parts: [{ text: "Final Answer" }] } }],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		await model.doGenerate({
			messages: [
				{
					role: "tool",
					toolCallId: "call_123",
					name: "searchWeb",
					content: "Search result content string",
				},
			],
		});

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({
				contents: [
					{
						role: "user",
						parts: [
							{
								functionResponse: {
									name: "searchWeb",
									response: { result: "Search result content string" },
								},
							},
						],
					},
				],
			}),
		);
	});

	it("should correctly configure functionDeclarations when tools are provided", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [{ content: { parts: [{ text: "Done" }] } }],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		await model.doGenerate({
			messages: [{ role: "user", content: "Hi" }],
			tools: [
				{
					name: "getWeather",
					description: "Get weather info",
					parameters: { type: "object", properties: {} },
					execute: async (_args: Record<string, unknown>) => "test",
				},
			],
		});

		expect(mockGenerateContent).toHaveBeenCalledWith(
			expect.objectContaining({
				config: expect.objectContaining({
					tools: [
						{
							functionDeclarations: [
								{
									name: "getWeather",
									description: "Get weather info",
									parameters: { type: "object", properties: {} },
								},
							],
						},
					],
				}),
			}),
		);
	});

	it("should throw LLMApiError when API error occurs", async () => {
		const mockError = {
			status: 401,
			code: "UNAUTHORIZED",
			message: "Invalid API Key",
		};
		mockGenerateContent.mockRejectedValueOnce(mockError);

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		await expect(
			model.doGenerate({
				messages: [{ role: "user", content: "Hi" }],
			}),
		).rejects.toThrow(LLMApiError);
	});

	it("should fallback to stop finishReason when unknown reason is returned", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [
				{
					content: { parts: [{ text: "Hi" }] },
					finishReason: "UNKNOWN_REASON",
				},
			],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(result.finishReason).toBe("stop");
	});

	it("should set finishReason to tool_calls when model returns functionCall", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [
				{
					content: {
						parts: [
							{
								functionCall: {
									name: "searchWeb",
									args: { query: "bun test" },
								},
								thoughtSignature: "xxx",
							},
						],
					},
					finishReason: "STOP",
				},
			],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Search" }],
		});

		expect(result.finishReason).toBe("tool_calls");
		expect(result.toolCalls).toEqual([
			{
				toolCallId: "call_0",
				name: "searchWeb",
				args: { query: "bun test" },
				thoughtSignature: "xxx",
			},
		]);
	});
});
