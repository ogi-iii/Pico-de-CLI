import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import type { FinishReason, LanguageModel, Tool } from "../types";
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

		// mock.module ではなく spyOn を使用して関数を差し替える
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

	describe("handleToolCalls (including executeTool)", () => {
		it("should handle missing tool error", async () => {
			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: {},
			});

			const response = {
				text: "Calling tool",
				finishReason: "tool_calls" as FinishReason,
				toolCalls: [{ name: "unknown_tool", toolCallId: "call_1", args: {} }],
			};

			const result = await agent.handleToolCalls(response);
			expect(result.toolCallCounts).toBe(0);
			expect(result.toolCallMessages[1]?.content).toBe(
				"An error occurred before the tool was called: Tool 'unknown_tool' not found.",
			);
		});

		it("should execute tool successfully with verbose logs", async () => {
			const dummyTool: Tool = {
				name: "dummy_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue("Tool execution success!"),
			};

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { dummy_tool: dummyTool },
				verbose: true,
			});

			const response = {
				text: "",
				finishReason: "tool_calls" as FinishReason,
				toolCalls: [
					{ name: "dummy_tool", toolCallId: "call_2", args: { a: 1 } },
				],
			};

			const result = await agent.handleToolCalls(response);
			expect(result.toolCallCounts).toBe(1);
			expect(result.toolCallMessages[1]?.content).toBe(
				"Tool execution success!",
			);
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

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { error_tool: errorTool },
			});

			const response = {
				text: "",
				finishReason: "tool_calls" as FinishReason,
				toolCalls: [{ name: "error_tool", toolCallId: "call_3", args: {} }],
			};

			const result = await agent.handleToolCalls(response);
			expect(result.toolCallCounts).toBe(1);
			expect(result.toolCallMessages[1]?.content).toBe(
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

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { approval_tool: approvalTool },
				approvalFunc: async () => false,
			});

			const response = {
				text: "",
				finishReason: "tool_calls" as FinishReason,
				toolCalls: [{ name: "approval_tool", toolCallId: "call_4", args: {} }],
			};

			const result = await agent.handleToolCalls(response);
			expect(result.toolCallCounts).toBe(0);
			expect(result.toolCallMessages[1]?.content).toBe(
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

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { approval_tool: approvalTool },
			});

			const response = {
				text: "",
				finishReason: "tool_calls" as FinishReason,
				toolCalls: [{ name: "approval_tool", toolCallId: "call_5", args: {} }],
			};

			const result = await agent.handleToolCalls(response);
			expect(requestApprovalSpy).toHaveBeenCalled();
			expect(result.toolCallCounts).toBe(1);
			expect(result.toolCallMessages[1]?.content).toBe("Approved!");
		});

		it("should slice long execution results in verbose log", async () => {
			const longText = "A".repeat(300);
			const longTool: Tool = {
				name: "long_tool",
				description: "",
				parameters: {},
				execute: mock().mockResolvedValue(longText),
			};

			const agent = new Agent({
				name: "TestAgent",
				instructions: "",
				model: mockModel,
				tools: { long_tool: longTool },
				verbose: true,
			});

			const response = {
				text: "",
				finishReason: "tool_calls" as FinishReason,
				toolCalls: [{ name: "long_tool", toolCallId: "call_6", args: {} }],
			};

			await agent.handleToolCalls(response);
			expect(consoleLogMock).toHaveBeenCalledWith(
				`The result of tool execution: ${"A".repeat(200)}...`,
			);
		});
	});

	describe("generate", () => {
		it("should return generated text without tool calls and issue a warning", async () => {
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

			generateTextSpy.mockResolvedValueOnce({
				text: "Let me check",
				finishReason: "tool_calls",
				toolCalls: [{ name: "dummy_tool", toolCallId: "1", args: {} }],
			});
			generateTextSpy.mockResolvedValueOnce({
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
