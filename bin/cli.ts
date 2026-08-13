import { existsSync as fsExistsSync, mkdirSync as fsMkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { Agent } from "../src/core/agent";
import { loadInstructions } from "../src/core/prompt-loader";
import { createModelFromEnv } from "../src/providers/modelFactory";
import { allTools } from "../src/tools/allTools";
import { ALLOWED_PREFIX, WORKSPACE_ROOT } from "../src/tools/common/constants";
import { isErrorWithMessage } from "../src/tools/common/error-handler";

type CliErrorHandlerStrategy = {
	canHandle: (error: unknown) => boolean;
	handle: (
		error: unknown,
		maskedValue: string | undefined,
		maskedLabel: string,
	) => void;
};

const cliErrorHandlerStrategies: CliErrorHandlerStrategy[] = [
	{
		canHandle: (error) => isErrorWithMessage(error),
		handle: (
			error: unknown,
			maskedValue: string | undefined,
			maskedLabel: string,
		) => {
			let message = (error as Error).message;
			if (maskedValue) {
				message = message.split(maskedValue).join(`${maskedLabel}`);
			}
			console.error(`\nError: The agent unexpectedly failed.\n`);
			console.error(`${message}`);
		},
	},
	{
		canHandle: (_error) => true,
		handle: (
			error: unknown,
			_maskedValue: string | undefined,
			_maskedLabel: string,
		) => {
			console.error(
				`\nError: The agent failed with unexpected error.\n`,
				error,
			);
		},
	},
];

async function main() {
	// ASCII Art Logo
	console.log(
		String.raw`
    ____  _                   __        ________    ____
   / __ \(_)________     ____/ /__     / ____/ /   /  _/
  / /_/ / / ___/ __ \   / __  / _ \   / /   / /    / /  
 / ____/ / /__/ /_/ /  / /_/ /  __/  / /___/ /____/ /   
/_/   /_/\___/\____/   \__,_/\___/   \____/_____/___/   
                                                        `.replace("\n", ""),
	);

	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			help: { type: "boolean", default: false, short: "h" },
			maxSteps: { type: "string", default: "30", short: "m" },
			verbose: { type: "boolean", default: false, short: "v" },
			yolo: { type: "boolean", default: false, short: "y" },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(
			`
Usage:
  bun run agent <YOUR_TASK_PROMPT> [options]

Arguments:
  YOUR_TASK_PROMPT         The task or query prompt for the agent to execute

Options:
  -h, --help               Show this help message and exit
  -m, --maxSteps <number>  Maximum execution steps for the agent (default: "30")
  -v, --verbose            Enable debug logs (default: false)
  -y, --yolo               Enable automatic tool execution approval (default: false)

Environment Variables:
  LLM_PROVIDER             LLM provider name (required)
  LLM_MODEL                Model name to use (required)
  LLM_API_KEY              API key for the provider (optional)
  LLM_URL                  Custom endpoint URL (optional)

Examples:
  bun run agent "Refactor src/index.ts to improve readability"
  bun run agent "Fix bugs in tests" --yolo --maxSteps 50
`.replace("\n", ""),
		);
		return;
	}

	const parsedMaxSteps = Number(values.maxSteps);
	const maxSteps = Number.isNaN(parsedMaxSteps) ? 30 : parsedMaxSteps;
	const verbose = values.verbose ?? false;
	const yoloMode = values.yolo ?? false;

	const userPrompt = positionals.join(" ").trim();
	if (!userPrompt) {
		console.error("Usage:\n  bun run agent <YOUR_TASK_PROMPT> [options]\n");
		console.error("To see help text, you can run:\n\n  bun run agent --help\n");
		console.error("Error: Please provide a task prompt.\n");
		process.exit(1);
	}

	if (!fsExistsSync(WORKSPACE_ROOT)) {
		fsMkdirSync(WORKSPACE_ROOT, { recursive: true });
		console.log(
			`The workspace directory was automatically created: '${ALLOWED_PREFIX}'`,
		);
	}

	const provider = process.env.LLM_PROVIDER;
	const modelName = process.env.LLM_MODEL;
	const apiKey = process.env.LLM_API_KEY;

	if (!provider || !modelName) {
		console.error("Error: The required LLM settings are missing.\n");
		console.error(
			"Please set the environment variables:\n\n  LLM_PROVIDER\n  LLM_MODEL\n" +
				"  LLM_URL     (optional)\n  LLM_API_KEY (optional)\n",
		);
		process.exit(1);
	}

	console.log(`Provider: ${provider}`);
	console.log(`Model: ${modelName}`);
	console.log(`Workspace: ${ALLOWED_PREFIX}`);
	console.log(`Max Steps: ${maxSteps} steps (--maxSteps)`);
	if (verbose) {
		console.log(`Debug Logs: ${verbose ? "ON" : "OFF"} (--verbose)`);
	}
	if (yoloMode) {
		console.log(`Automatic Approval: ${yoloMode ? "ON" : "OFF"} (--yolo)`);
	}
	console.log(
		`\nTask: ${userPrompt.slice(0, 100)}${userPrompt.length > 100 ? "..." : ""}\n`,
	);

	const model = createModelFromEnv();
	const baseInstructions = loadInstructions(WORKSPACE_ROOT);
	const agent = new Agent({
		name: "Pico de CLI",
		instructions: baseInstructions,
		model,
		tools: allTools,
		maxSteps,
		verbose,
		approvalFunc: yoloMode
			? async (name) => {
					console.log(`Tool Name: ${name}`);
					console.log(
						"Tool execution was automatically approved. Running now...\n",
					);
					return true;
				}
			: undefined,
	});

	try {
		await agent.generate(userPrompt);
	} catch (error) {
		cliErrorHandlerStrategies
			.find((s) => s.canHandle(error))
			?.handle(error, apiKey, "<YOUR_API_KEY>");
		process.exit(1);
	}
}

main();
