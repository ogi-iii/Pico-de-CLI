import type {
	GenerateTextResult,
	LanguageModel,
	Message,
	Tool,
	ToolCall,
} from "../types";
import { requestApproval } from "./approval";
import { generateText } from "./generate-text";

export interface AgentConfig {
	name: string;
	instructions: string;
	model: LanguageModel;
	tools: Record<string, Tool>;
	maxSteps?: number;
	verbose?: boolean;
	approvalFunc?: (
		toolName: string,
		args: Record<string, unknown>,
	) => Promise<boolean>;
}

async function executeTool(
	tool: Tool,
	args: Record<string, unknown>,
): Promise<string> {
	try {
		return await tool.execute(args);
	} catch (error) {
		return `An error occurred during the tool execution: ${error instanceof Error ? error.message : String(error)}`;
	}
}

export class Agent {
	private name: string;
	private instructions: string;
	private model: LanguageModel;
	private tools: Tool[];
	private maxSteps: number;
	private verbose: boolean;
	private approvalFunc: (
		toolName: string,
		args: Record<string, unknown>,
	) => Promise<boolean>;

	constructor(config: AgentConfig) {
		this.name = config.name;
		this.instructions = config.instructions;
		this.model = config.model;
		this.tools = Object.values(config.tools);
		this.maxSteps = config.maxSteps ?? 10;
		this.verbose = config.verbose ?? false;
		this.approvalFunc = config.approvalFunc ?? requestApproval; // default: dialogic approval via CLI

		if (this.verbose) {
			console.log(`\nAgent '${this.name}' successfully constructed.`);
		}
	}

	private async handleToolCalls(
		response: GenerateTextResult,
	): Promise<{ toolCallMessages: Message[]; toolCallCounts: number }> {
		const toolCallMessages: Message[] = [];
		let toolCallCounts: number = 0;

		toolCallMessages.push({
			role: "assistant",
			content: response.text,
			toolCalls: response.toolCalls,
		});

		for (const toolCall of response.toolCalls as ToolCall[]) {
			const tool = this.tools.find((t) => t.name === toolCall.name);

			if (!tool) {
				toolCallMessages.push({
					role: "tool",
					toolCallId: toolCall.toolCallId,
					name: toolCall.name,
					content: `An error occurred before the tool was called: Tool '${toolCall.name}' not found.`,
				});
				continue;
			}

			if (this.verbose) {
				console.log(
					`Tool execution: ${toolCall.name} (${JSON.stringify(toolCall.args)})`,
				);
			}

			if (tool.needsApproval) {
				const approved = await this.approvalFunc(toolCall.name, toolCall.args);
				if (!approved) {
					toolCallMessages.push({
						role: "tool",
						toolCallId: toolCall.toolCallId,
						name: toolCall.name,
						content:
							"The tool execution was cancelled by the user: It needs to consider an alternative method.",
					});
					continue;
				}
			}

			const toolExecutionResult = await executeTool(tool, toolCall.args);
			toolCallCounts++;

			if (this.verbose) {
				console.log(
					`The result of tool execution: ${toolExecutionResult.slice(0, 200)}${toolExecutionResult.length > 200 ? "..." : ""}`,
				);
			}
			toolCallMessages.push({
				role: "tool",
				toolCallId: toolCall.toolCallId,
				name: toolCall.name,
				content: toolExecutionResult,
			});
		}

		return {
			toolCallMessages,
			toolCallCounts,
		};
	}

	async generate(userPrompt: string): Promise<{ text: string }> {
		const messages: Message[] = [
			{ role: "system", content: this.instructions },
			{ role: "user", content: userPrompt },
		];

		let currentStep = 0;
		let toolCallCount = 0;
		let finalText = "";

		while (currentStep < this.maxSteps) {
			currentStep++;

			if (this.verbose) {
				console.log(`\n=== Step ${currentStep}/${this.maxSteps} ===`);
			}

			const response = await generateText({
				model: this.model,
				messages,
				tools: this.tools,
			});

			if (response.text) {
				finalText = response.text;

				if (this.verbose) {
					console.log(`Response: ${response.text}`);
				}
			}

			if (response.toolCalls && response.toolCalls.length > 0) {
				const { toolCallMessages, toolCallCounts } =
					await this.handleToolCalls(response);

				messages.push(...toolCallMessages);
				toolCallCount += toolCallCounts;

				continue; // To the next thinking loop
			}

			messages.push({
				role: "assistant",
				content: response.text,
			}); // In case that the tool callings not found

			break;
		}

		if (currentStep >= this.maxSteps) {
			console.warn(
				"Warning: it reaches out the maximum steps in the thinking loop.",
			);
		}

		if (toolCallCount === 0 && currentStep === 1) {
			console.warn(
				"Warning: No tools were called, and the agent has terminated.",
			);
		}

		return {
			text: finalText,
		};
	}
}
