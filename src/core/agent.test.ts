import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import type {
	FinishReason,
	LanguageModel,
	Message,
	Tool,
	ToolMessage,
} from "../types";
import { Agent } from "./agent";
import * as approvalModule from "./approval";
import * as generateTextModule from "./generate-text";

describe("Agent Class Coverage Tests", () => {
	let consoleLogMock: ReturnType<typeof spyOn>;
	let consoleWarnMock: ReturnType<typeof spyOn>;
	let generateTextSpy: ReturnType<typeof spyOn>;
	let requestApprovalSpy: ReturnType<typeof spyOn>;
	const mockModel = {} as LanguageModel;

	beforeEach(() => {
		consoleLogMock = spyOn(console, "log").mockImplementation(() => {});
		consoleWarnMock = spyOn(console, "warn").mockImplementation(() => {});
		consoleLogMock.mockClear();
		consoleWarnMock.mockClear();

		generateTextSpy = spyOn(
			generateTextModule,
			"generateText",
		).mockImplementation(async () => ({
			text: "",
			finishReason: "stop" as FinishReason,
		}));
		requestApprovalSpy = spyOn(
			approvalModule,
			"requestApproval",
		).mockImplementation(async () => false);
	});

	afterEach(() => {
		consoleLogMock.mockRestore();
		consoleWarnMock.mockRestore();
		generateTextSpy.mockRestore();
		requestApprovalSpy.mockRestore();
	});

	describe("constructor", () => {
		it("should initialize with default values correctly", () => {
			consoleLogMock.mockClear();
			const agent = new Agent({
				name: "DefaultAgent",
				instructions: "System prompt",
				model: mockModel,
				tools: {},
			});
			expect(agent).toBeDefined();
			expect(consoleLogMock).not.toHaveBeenCalled();
		});

		it("should initialize with custom values and log if verbose is true", () => {
			consoleLogMock.mockClear();
			const agent = new Agent({
				name: "VerboseAgent",
				instructions: "System prompt",
				model: mockModel,
				tools: {},
				maxSteps: 5,
				verbose: true,
			});
			expect(agent).toBeDefined();
			expect(consoleLogMock).toHaveBeenCalledWith(
				"\nAgent 'VerboseAgent' successfully constructed.",
			);
		});
	});

	describe("tool execution via generate()", () => {
		it("should handle missing tool error", async () => {
			generateTextSpy
				.mockResolvedValueOnce({
					text: "Calling unknown tool",
					finishReason: "tool_calls",
					toolCalls: [{ name: "unknown_tool", toolCallId: "call_1", args: {} }],
				})
				.mockResolvedValueOnce({ text: "Recovered", finishReason: "stop" });

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: {},
			});

			await agent.generate("Run missing tool");

			const secondCallMessages = generateTextSpy.mock.calls[1][0].messages;
			const toolMsg = secondCallMessages.find(
				(m: Message) => m.role === "tool",
			) as ToolMessage;

			expect(toolMsg?.content).toBe(
				"An error occurred before the tool was called: Tool 'unknown_tool' not found.",
			);
		});

		it("should execute tool successfully with verbose logs", async () => {
			consoleLogMock.mockClear();
			const dummyTool: Tool = {
				name: "dummy_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue("Tool execution success!"),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [
						{ name: "dummy_tool", toolCallId: "call_2", args: { a: 1 } },
					],
				})
				.mockResolvedValueOnce({ text: "Done", finishReason: "stop" });

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { dummy_tool: dummyTool },
				verbose: true,
			});

			await agent.generate("Run dummy tool");

			const secondCallMessages = generateTextSpy.mock.calls[1][0].messages;
			const toolMsg = secondCallMessages.find(
				(m: Message) => m.role === "tool",
			) as ToolMessage;

			expect(toolMsg?.content).toBe("Tool execution success!");
			expect(consoleLogMock).toHaveBeenCalledWith(
				'Tool execution: dummy_tool ({"a":1})',
			);
			expect(consoleLogMock).toHaveBeenCalledWith(
				"The result of tool execution: Tool execution success!",
			);
		});

		it("should catch errors thrown by tool execution", async () => {
			const errorTool: Tool = {
				name: "error_tool",
				description: "",
				parameters: {},
				execute: mock().mockRejectedValue(new Error("Something went wrong")),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "error_tool", toolCallId: "call_3", args: {} }],
				})
				.mockResolvedValueOnce({ text: "Done", finishReason: "stop" });

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { error_tool: errorTool },
			});

			await agent.generate("Run error tool");

			const secondCallMessages = generateTextSpy.mock.calls[1][0].messages;
			const toolMsg = secondCallMessages.find(
				(m: Message) => m.role === "tool",
			) as ToolMessage;

			expect(toolMsg?.content).toBe(
				"An error occurred during the tool execution: Something went wrong",
			);
		});

		it("should handle tool approval cancellation", async () => {
			const approvalTool: Tool = {
				name: "approval_tool",
				description: "",
				parameters: {},
				needsApproval: true,
				execute: mock().mockResolvedValue("Will not be reached"),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [
						{ name: "approval_tool", toolCallId: "call_4", args: {} },
					],
				})
				.mockResolvedValueOnce({ text: "Done", finishReason: "stop" });

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { approval_tool: approvalTool },
				approvalFunc: async () => false,
			});

			await agent.generate("Run approval tool");

			const secondCallMessages = generateTextSpy.mock.calls[1][0].messages;
			const toolMsg = secondCallMessages.find(
				(m: Message) => m.role === "tool",
			) as ToolMessage;

			expect(toolMsg?.content).toBe(
				"The tool execution was cancelled by the user: It needs to consider an alternative method.",
			);
		});

		it("should handle default approval function properly when accepted", async () => {
			requestApprovalSpy.mockResolvedValueOnce(true);

			const approvalTool: Tool = {
				name: "approval_tool",
				description: "",
				parameters: {},
				needsApproval: true,
				execute: mock().mockResolvedValue("Approved!"),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [
						{ name: "approval_tool", toolCallId: "call_5", args: {} },
					],
				})
				.mockResolvedValueOnce({ text: "Done", finishReason: "stop" });

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { approval_tool: approvalTool },
			});

			await agent.generate("Run approval tool");

			expect(requestApprovalSpy).toHaveBeenCalled();
			const secondCallMessages = generateTextSpy.mock.calls[1][0].messages;
			const toolMsg = secondCallMessages.find(
				(m: Message) => m.role === "tool",
			) as ToolMessage;

			expect(toolMsg?.content).toBe("Approved!");
		});

		it("should slice long execution results in verbose log", async () => {
			consoleLogMock.mockClear();
			const longText = "A".repeat(300);
			const longTool: Tool = {
				name: "long_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue(longText),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "long_tool", toolCallId: "call_6", args: {} }],
				})
				.mockResolvedValueOnce({ text: "Done", finishReason: "stop" });

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { long_tool: longTool },
				verbose: true,
			});

			await agent.generate("Run long tool");

			expect(consoleLogMock).toHaveBeenCalledWith(
				`The result of tool execution: ${"A".repeat(200)}...`,
			);
		});
	});

	describe("context management (manageContext)", () => {
		it("should skip compression if message length is less than 10", async () => {
			generateTextSpy.mockResolvedValueOnce({
				text: "Response",
				finishReason: "stop",
			});

			const agent = new Agent({
				name: "ContextAgent",
				instructions: "System",
				model: mockModel,
				tools: {},
				contextCharacterLimit: 100,
			});

			await agent.generate("Hello");

			expect(consoleLogMock).not.toHaveBeenCalledWith(
				expect.stringContaining("Compress the chat history"),
			);
		});

		it("should omit long tool results in middleMessages when total length exceeds limit", async () => {
			const dummyTool: Tool = {
				name: "dummy_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue("A".repeat(300)),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "1", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "2", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "3", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "4", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "Final response after context compression",
					finishReason: "stop",
				});

			const agent = new Agent({
				name: "ContextAgent",
				instructions: "System prompt",
				model: mockModel,
				tools: { dummy_tool: dummyTool },
				contextCharacterLimit: 800,
			});

			await agent.generate("Start context test");

			expect(consoleLogMock).toHaveBeenCalledWith(
				expect.stringContaining("Compress the chat history"),
			);
			expect(consoleLogMock).toHaveBeenCalledWith(
				expect.stringContaining("Successfully optimized the LLM's context."),
			);

			const finalCallMessages =
				generateTextSpy.mock.calls[generateTextSpy.mock.calls.length - 1][0]
					.messages;

			const omittedToolMessage = finalCallMessages.find(
				(m: Message) =>
					m.role === "tool" &&
					m.content.includes(
						"The result of previous tool execution have been omitted",
					),
			);

			expect(omittedToolMessage).toBeDefined();
		});

		it("should shift middle messages and removing associated tool messages if character limit is still exceeded", async () => {
			const dummyTool: Tool = {
				name: "dummy_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue("B".repeat(50)),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "1", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "2", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "3", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "4", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "Done",
					finishReason: "stop",
				});

			const agent = new Agent({
				name: "ContextAgent",
				instructions: "Short system",
				model: mockModel,
				tools: { dummy_tool: dummyTool },
				contextCharacterLimit: 120,
			});

			await agent.generate("Trigger removal");

			const finalCallMessages =
				generateTextSpy.mock.calls[generateTextSpy.mock.calls.length - 1][0]
					.messages;

			expect(finalCallMessages.length).toBeLessThan(11);
		});
	});

	describe("generate loop", () => {
		it("should return generated text without tool calls and issue a warning", async () => {
			consoleLogMock.mockClear();
			consoleWarnMock.mockClear();

			generateTextSpy.mockResolvedValueOnce({
				text: "Final answer",
				finishReason: "stop",
			});

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: {},
				verbose: true,
			});

			const result = await agent.generate("Hello");
			expect(result.text).toBe("Final answer");
			expect(consoleWarnMock).toHaveBeenCalledWith(
				"Warning: No tools were called, and the agent has terminated.",
			);
			expect(consoleLogMock).toHaveBeenCalledWith("\n=== Step 1/10 ===");
			expect(consoleLogMock).toHaveBeenCalledWith("Response: Final answer");
		});

		it("should handle tool calls and continue generation loop", async () => {
			const dummyTool: Tool = {
				name: "dummy_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue("Result from tool"),
			};

			generateTextSpy
				.mockResolvedValueOnce({
					text: "Let me check",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "1", args: {} }],
				})
				.mockResolvedValueOnce({
					text: "Finished based on tool",
					finishReason: "stop",
				});

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { dummy_tool: dummyTool },
			});

			const result = await agent.generate("Do something");
			expect(result.text).toBe("Finished based on tool");
			expect(consoleWarnMock).not.toHaveBeenCalled();
		});

		it("should hit maxSteps and issue a warning", async () => {
			consoleWarnMock.mockClear();
			const dummyTool: Tool = {
				name: "dummy_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue("Infinite tool loop result"),
			};

			generateTextSpy.mockImplementation(async () => {
				return {
					text: "Calling...",
					finishReason: "tool_calls",
					toolCalls: [{ name: "dummy_tool", toolCallId: "1", args: {} }],
				};
			});

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { dummy_tool: dummyTool },
				maxSteps: 2,
			});

			const result = await agent.generate("Loop start");
			expect(result.text).toBe("Calling...");
			expect(consoleWarnMock).toHaveBeenCalledWith(
				"Warning: it reaches out the maximum steps in the thinking loop.",
			);
		});
	});
});
