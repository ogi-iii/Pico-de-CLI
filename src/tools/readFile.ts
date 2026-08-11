import type { Stats } from "node:fs";
import { readFile as fsReadFile, stat } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";
import { ENCODING, MAX_FILE_SIZE, WORKSPACE_ROOT } from "./common/constants";
import { handleNotFoundError } from "./common/error-handler";
import { validateRealPath, validateWorkspacePath } from "./common/validators";

async function validate(
	filePath: string,
	displayPath: string,
): Promise<string> {
	validateWorkspacePath(filePath, `'${displayPath}' is out of the workspace.`);
	const realPath = await validateRealPath(filePath, displayPath);
	await validateFileStats(realPath, displayPath);
	return realPath;
}

async function validateFileStats(
	filePath: string,
	displayPath: string,
): Promise<void> {
	let stats: Stats;
	try {
		stats = await stat(filePath);
	} catch (error) {
		handleNotFoundError(error, displayPath);
	}
	if (!stats.isFile()) {
		throw new Error(`Not a regular file: '${displayPath}'`);
	}
	if (stats.size > MAX_FILE_SIZE) {
		throw new Error(
			`Too large file to load: ${displayPath} (${Math.round(stats.size / 1024)}KB) ` +
				`Only a file of ${MAX_FILE_SIZE / 1024} KB or less can be loaded.`,
		);
	}
}

async function readFileExecute(args: Record<string, unknown>): Promise<string> {
	const { path } = args as { path: string };
	const absolutePath = pathResolve(WORKSPACE_ROOT, path);
	const realPath = await validate(absolutePath, path);
	return await fsReadFile(realPath, ENCODING);
}

export const readFile = {
	name: "readFile",
	description:
		"This tool reads the contents of a file at the specified path within the workspace as a string. it returns an error if the file does not exist. Files larger than 100 KB cannot be read (to protect the context window). Either a relative or absolute path may be specified.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description:
					"Path to the file to load (e.g., 'README.md', 'src/index.ts'）",
			},
		},
		required: ["path"],
	},
	execute: readFileExecute,
	needsApproval: false,
};
