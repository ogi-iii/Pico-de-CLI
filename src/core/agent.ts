import type {
	GenerateTextResult,
	LanguageModel,
	Message,
	Tool,
	ToolCall,
} from "../types";
import { requestApproval } from "./approval";
import { generateText } from "./generate-text";

interface AgentConfig {
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
	contextCharacterLimit?: number;
	toolContentCharacterLimit?: number;
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
	private contextCharacterLimit: number;
	private toolContentCharacterLimit: number;

	constructor(config: AgentConfig) {
		this.name = config.name;
		this.instructions = config.instructions;
		this.model = config.model;
		this.tools = Object.values(config.tools);
		this.maxSteps = config.maxSteps ?? 10;
		this.verbose = config.verbose ?? false;
		this.approvalFunc = config.approvalFunc ?? requestApproval; // default: dialogic approval via CLI
		this.contextCharacterLimit = config.contextCharacterLimit ?? 30_000;
		this.toolContentCharacterLimit = config.toolContentCharacterLimit ?? 200;

		if (this.verbose) {
			console.log(`\nAgent '${this.name}' successfully constructed.`);
		}
	}

	private async executeTool(
		tool: Tool,
		args: Record<string, unknown>,
	): Promise<string> {
		try {
			return await tool.execute(args);
		} catch (error) {
			return `An error occurred during the tool execution: ${error instanceof Error ? error.message : String(error)}`;
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

			const toolExecutionResult = await this.executeTool(tool, toolCall.args);
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

	private removeToolMessagesWith(
		removedMessage: Message,
		fromTargetMessages: Message[],
	): number {
		let removedLength = removedMessage.content.length;
		if (removedMessage.role === "assistant") {
			while (
				fromTargetMessages.length > 0 &&
				fromTargetMessages[0]?.role === "tool"
			) {
				const removedToolMessage = fromTargetMessages.shift();
				if (removedToolMessage) {
					removedLength += removedToolMessage.content.length;
				}
			}
		}
		return removedLength;
	}

	private manageContext(messages: Message[]): Message[] {
		if (messages.length < 10) {
			return messages;
		}

		const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
		if (totalLength < this.contextCharacterLimit) {
			return messages;
		}
		console.log(
			`\nCompress the chat history to optimize the LLM's context. (As is: ${totalLength} characters)`,
		);

		const initialMessages = messages.slice(0, 2); // system message with user message
		const recentMessages = messages.slice(-4);
		const middleMessages = messages.slice(2, -4).map((message) => {
			if (
				message.role === "tool" &&
				message.content.length > this.toolContentCharacterLimit
			) {
				return {
					...message,
					content: `(The result of previous tool execution have been omitted: ${message.content.length} characters)`,
				};
			}
			return message;
		});

		let compressedTotalLength =
			initialMessages.reduce((sum, m) => sum + m.content.length, 0) +
			middleMessages.reduce((sum, m) => sum + m.content.length, 0) +
			recentMessages.reduce((sum, m) => sum + m.content.length, 0);

		while (
			compressedTotalLength > this.contextCharacterLimit &&
			middleMessages.length > 0
		) {
			const removedMessage = middleMessages.shift();
			if (removedMessage) {
				compressedTotalLength -= this.removeToolMessagesWith(
					removedMessage,
					middleMessages,
				);
			}
		}
		console.log(
			`\nSuccessfully optimized the LLM's context. (To be: ${compressedTotalLength} characters)\n`,
		);
		return [...initialMessages, ...middleMessages, ...recentMessages];
	}

	async generate(userPrompt: string): Promise<{ text: string }> {
		let messages: Message[] = [
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
			messages = this.manageContext(messages);

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
