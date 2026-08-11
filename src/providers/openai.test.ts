import { beforeEach, describe, expect, it, mock } from "bun:test";
import { LLMApiError } from "../types";
import { createOpenAI } from "./openai";

const mockCreate = mock();

mock.module("openai", () => {
	return {
		default: class OpenAI {
			chat = {
				completions: {
					create: mockCreate,
				},
			};
		},
	};
});

describe("createOpenAI", () => {
	beforeEach(() => {
		mockCreate.mockClear();
	});

	it("should correctly convert messages (user, system, tool, assistant) and baseURL", async () => {
		mockCreate.mockResolvedValueOnce({
			choices: [
				{
					message: { content: "Hello!", tool_calls: null },
					finish_reason: "stop",
				},
			],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 20,
				total_tokens: 30,
			},
		});

		const openai = createOpenAI({
			apiKey: "test-key",
			baseURL: "http://localhost:11434/v1/chat/completions/",
			maxRetries: 2,
		});
		const model = openai("gpt-4o");

		const result = await model.doGenerate({
			messages: [
				{ role: "system", content: "System prompt" },
				{ role: "user", content: "User prompt" },
				{
					role: "assistant",
					content: "Assistant message",
					toolCalls: [
						{
							toolCallId: "call_1",
							name: "search",
							args: { q: "bun" },
						},
					],
				},
				{
					role: "assistant",
					content: "Assistant message without tools",
				},
				{
					role: "tool",
					toolCallId: "call_1",
					name: "SearchTool",
					content: "Search result",
				},
			],
			temperature: 0.7,
			maxTokens: 100,
		});

		expect(result.text).toBe("Hello!");
		expect(result.finishReason).toBe("stop");
		expect(result.usage).toEqual({
			promptTokens: 10,
			completionTokens: 20,
			totalTokens: 30,
		});

		expect(mockCreate).toHaveBeenCalledWith(
			{
				model: "gpt-4o",
				messages: [
					{ role: "system", content: "System prompt" },
					{ role: "user", content: "User prompt" },
					{
						role: "assistant",
						content: "Assistant message",
						tool_calls: [
							{
								id: "call_1",
								type: "function",
								function: {
									name: "search",
									arguments: JSON.stringify({ q: "bun" }),
								},
							},
						],
					},
					{
						role: "assistant",
						content: "Assistant message without tools",
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						content: "Search result",
					},
				],
				temperature: 0.7,
				max_completion_tokens: 100,
			},
			{
				signal: undefined,
			},
		);
	});

	it("should handle tool definitions and tool_calls in response with valid JSON arguments", async () => {
		mockCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						content: null,
						tool_calls: [
							{
								id: "call_abc",
								type: "function",
								function: {
									name: "getWeather",
									arguments: '{"location":"Tokyo"}',
								},
							},
							{
								id: "call_ignore",
								type: "custom_type",
								function: {
									name: "ignoreMe",
									arguments: "{}",
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		});

		const openai = createOpenAI();
		const model = openai("gpt-4o");

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Weather in Tokyo?" }],
			tools: [
				{
					name: "getWeather",
					description: "Get weather info",
					parameters: { type: "object" },
					execute: async () => "It's sunny.",
				},
			],
		});

		expect(result.text).toBe("");
		expect(result.finishReason).toBe("tool_calls");
		expect(result.toolCalls).toEqual([
			{
				toolCallId: "call_abc",
				name: "getWeather",
				args: { location: "Tokyo" },
			},
		]);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [
					{
						type: "function",
						function: {
							name: "getWeather",
							description: "Get weather info",
							parameters: { type: "object" },
						},
					},
				],
			}),
			expect.anything(),
		);
	});

	it("should fall back gracefully when tool call arguments are malformed JSON or empty string", async () => {
		mockCreate.mockResolvedValueOnce({
			choices: [
				{
					message: {
						content: "Response",
						tool_calls: [
							{
								id: "call_malformed",
								type: "function",
								function: {
									name: "brokenTool",
									arguments: "invalid json string",
								},
							},
							{
								id: "call_empty",
								type: "function",
								function: {
									name: "emptyTool",
									arguments: "",
								},
							},
						],
					},
					finish_reason: "stop",
				},
			],
		});

		const openai = createOpenAI();
		const model = openai("gpt-4o");

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Test" }],
		});

		expect(result.toolCalls).toEqual([
			{
				toolCallId: "call_malformed",
				name: "brokenTool",
				args: {},
			},
			{
				toolCallId: "call_empty",
				name: "emptyTool",
				args: {},
			},
		]);
	});

	it("should map unknown finishReason to stop", async () => {
		mockCreate.mockResolvedValueOnce({
			choices: [
				{
					message: { content: "Hi" },
					finish_reason: "unknown_reason_from_api",
				},
			],
		});

		const openai = createOpenAI();
		const model = openai("gpt-4o");

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(result.finishReason).toBe("stop");
	});

	it("should throw LLMApiError when choices array is empty", async () => {
		mockCreate.mockResolvedValueOnce({
			choices: [],
		});

		const openai = createOpenAI();
		const model = openai("gpt-4o");

		await expect(
			model.doGenerate({
				messages: [{ role: "user", content: "Hi" }],
			}),
		).rejects.toThrow(
			new LLMApiError(
				500,
				"openai",
				undefined,
				"There is no response from OpenAI chat completions API.",
			),
		);
	});

	it("should throw LLMApiError with status, code, and message when OpenAI API throws an error", async () => {
		const apiError = {
			status: 401,
			code: "invalid_api_key",
			message: "Incorrect API key provided",
		};
		mockCreate.mockRejectedValueOnce(apiError);

		const openai = createOpenAI();
		const model = openai("gpt-4o");

		try {
			await model.doGenerate({
				messages: [{ role: "user", content: "Hi" }],
			});
			expect.unreachable("Should have thrown LLMApiError");
		} catch (e) {
			expect(e).toBeInstanceOf(LLMApiError);
			const err = e as LLMApiError;
			expect(err.status).toBe(401);
			expect(err.provider).toBe("openai");
			expect(err.code).toBe("invalid_api_key");
			expect(err.message).toBe("Incorrect API key provided");
		}
	});

	it("should fallback error status to 500 when caught error has no status, code, or message", async () => {
		mockCreate.mockRejectedValueOnce(new Error("Unknown system crash"));

		const openai = createOpenAI();
		const model = openai("gpt-4o");

		try {
			await model.doGenerate({
				messages: [{ role: "user", content: "Hi" }],
			});
			expect.unreachable("Should have thrown LLMApiError");
		} catch (e) {
			expect(e).toBeInstanceOf(LLMApiError);
			const err = e as LLMApiError;
			expect(err.status).toBe(500);
			expect(err.provider).toBe("openai");
			expect(err.code).toBeUndefined();
			expect(err.message).toBe("Unknown system crash");
		}
	});
});
