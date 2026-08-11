import { spawn } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import type { Tool } from "../types";
import { ALLOWED_PREFIX, WORKSPACE_ROOT } from "./common/constants";

type Quote = '"' | "'" | null;

type ExecCommandInput = {
	// Expected input format
	command?: unknown;
	// Unexpected yet permissible input formats
	commandName?: unknown;
	commandArgs?: unknown;
};

type ParsedCommand = {
	commandName: string;
	commandArgs: string[];
	commandForCheck: string;
};

type CommandStrategy = {
	match: (input: ExecCommandInput) => boolean;
	parse: (input: ExecCommandInput) => ParsedCommand;
};

const ALLOWED_COMMANDS = ["bun", "ls", "cat", "grep", "find", "pwd", "mkdir"];
const MAX_OUTPUT_LENGTH = 2 * 1024; // 2 KB
const DANGEROUS_CHARS = /[;&`$|]/;
const DANGEROUS_PATTERNS = [
	/rm\s+-rf/,
	/>\s*\/dev/,
	/curl.*\|.*sh/,
	/wget.*\|.*sh/,
	/\s+--git-dir\b/,
	/\s+--work-tree\b/,
	/\s+-exec\b/,
	/\s+-delete\b/,
];
const COMMAND_STRATEGIES: CommandStrategy[] = [
	{
		match: (input) => typeof input.command === "string",
		parse: (input) => {
			const command = validateMetacharacters(input.command as string);
			const parts = parseCommand(command);
			return {
				commandName: parts[0] || "",
				commandArgs: parts.slice(1),
				commandForCheck: command,
			};
		},
	},
	{
		match: (input) => typeof input.commandName === "string",
		parse: (input) => {
			const commandName = input.commandName as string;
			const args = input.commandArgs;
			if (
				args !== undefined &&
				(!Array.isArray(args) || !args.every((arg) => typeof arg === "string"))
			) {
				throw new Error(
					"'commandArgs' must be specified as an array of strings.",
				);
			}
			const commandArgs = (args || []) as string[];
			return {
				commandName: commandName,
				commandArgs: commandArgs,
				commandForCheck: [commandName, ...commandArgs].join(" "),
			};
		},
	},
];

function validateMetacharacters(command: string): string {
	if (DANGEROUS_CHARS.test(command)) {
		throw new Error(
			"For security reasons, commands containing shell metacharacters cannot be executed.",
		);
	}
	return command;
}

function parseCommand(input: string): string[] {
	const tokens: string[] = [];
	let currentToken = "";
	let quote: Quote = null;
	let escaped = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i] as string;

		// When inside the quote
		if (quote) {
			if (escaped) {
				currentToken += ch; // e.g., \" -> "
				escaped = false;
				continue;
			}

			if (quote === '"' && ch === "\\") {
				escaped = true; // To escape next character
				continue;
			}

			if (ch === quote) {
				quote = null; // The end of the quote
				continue;
			}

			currentToken += ch;
			continue;
		}

		// When outside the quote
		if (ch === "\\") {
			const nextCh = input[i + 1];
			if (nextCh === '"' || nextCh === "'") {
				currentToken += nextCh; // e.g., \" -> " or \' -> '
				i++;
				continue;
			}
			currentToken += ch; // e.g., C:\path\to\dir
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch; // The start of the quote
			continue;
		}
		if (/\s/.test(ch)) {
			if (currentToken.length > 0) {
				tokens.push(currentToken); // To separate from the next token
				currentToken = "";
			}
			continue;
		}
		currentToken += ch;
	}

	if (quote) {
		throw new Error(`Unclosed quote: ${quote}`);
	}
	if (currentToken.length > 0) {
		tokens.push(currentToken); // To add the final token
	}
	return tokens;
}

function parse(input: ExecCommandInput): {
	commandName: string;
	commandArgs: string[];
} {
	const strategy = COMMAND_STRATEGIES.find((s) => s.match(input)); // Only the first one found is returned.
	if (!strategy) {
		throw new Error("You must specify a command.");
	}
	const { commandName, commandArgs, commandForCheck } = strategy.parse(input);
	validate(commandName, commandArgs, commandForCheck);
	return { commandName, commandArgs };
}

function validateCommandName(commandName: string): void {
	if (!commandName) {
		throw new Error("Command is empty.");
	}
	if (!ALLOWED_COMMANDS.includes(commandName)) {
		throw new Error(`The command '${commandName}' is not permitted.`);
	}
}

function validateCommandArgs(args: string[]): void {
	for (const arg of args) {
		if (
			arg.startsWith("/") ||
			arg.startsWith(".") ||
			arg.includes("/") ||
			arg.includes("\\")
		) {
			const resolvedPath = pathResolve(WORKSPACE_ROOT, arg);
			if (
				!resolvedPath.startsWith(ALLOWED_PREFIX) &&
				resolvedPath !== WORKSPACE_ROOT
			) {
				throw new Error(`Access denied: '${arg}' is outside the workspace.`);
			}
		}
	}
}

function validateCommandPattern(command: string): void {
	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			throw new Error("A dangerous command pattern was detected.");
		}
	}
}

function validate(
	commandName: string,
	commandArgs: string[],
	commandPattern: string,
): void {
	validateCommandName(commandName);
	validateCommandArgs(commandArgs);
	validateCommandPattern(commandPattern);
}

function truncateText(output: string): string {
	const trimmedOutput = output.trim();
	return trimmedOutput.length >= MAX_OUTPUT_LENGTH
		? trimmedOutput.slice(0, MAX_OUTPUT_LENGTH) +
				"\n... (This output was too long and was truncated.)"
		: trimmedOutput;
}

async function execCommandExecute(
	args: Record<string, unknown>,
): Promise<string> {
	const input = args as ExecCommandInput; // To maintain robustness against LLM hallucinations
	const { commandName, commandArgs } = parse(input);

	return new Promise((resolve, reject) => {
		const child = spawn(commandName, commandArgs, {
			cwd: WORKSPACE_ROOT,
			timeout: 30000, // 30 seconds (30,000 milliseconds)
			shell: false, // To prevent command injection
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data: Buffer) => {
			if (stdout.length < MAX_OUTPUT_LENGTH) {
				stdout += data.toString();
				stdout = truncateText(stdout);
			}
		});

		child.stderr.on("data", (data: Buffer) => {
			if (stderr.length < MAX_OUTPUT_LENGTH) {
				stderr += data.toString();
				stderr = truncateText(stderr);
			}
		});

		child.on("close", (code: number | null) => {
			if (code !== 0) {
				reject(
					new Error(
						`The command terminated abnormally: \n${stderr}` +
							`\n(exit code: ${code})`,
					),
				);
			}
			// Some commands output their results to stderr even when they execute successfully.
			resolve(
				`The command executed successfully: \n${stdout}` +
					(stderr ? `\n(stderr: ${stderr})` : ""),
			);
		});

		child.on("error", (error: Error) => {
			reject(new Error(`Failed to execute command: ${error.message}`));
		});
	});
}

export const execCommand: Tool = {
	name: "execCommand",
	description:
		"This tool executes a command within the workspace. The permitted commands are bun, ls, cat, grep, find, pwd, and mkdir. However, to prevent security issues, the use of shell metacharacters such as [;&`$|] is prohibited.",
	parameters: {
		type: "object",
		properties: {
			command: {
				type: "string",
				description:
					'Command with arguments to execute (e.g., "bun test", "ls -la src/")',
			},
		},
		required: ["command"],
	},
	execute: execCommandExecute,
};
