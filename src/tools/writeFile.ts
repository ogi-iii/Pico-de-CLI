import { writeFile as fsWriteFile, mkdir } from "node:fs/promises";
import { dirname, resolve as pathResolve } from "node:path";
import { ENCODING, WORKSPACE_ROOT } from "./common/constants";
import { isErrorWithMessage } from "./common/error-handler";
import { validateRealPath, validateWorkspacePath } from "./common/validators";

const isNotFoundError = (error: unknown): boolean =>
	isErrorWithMessage(error) && error.message.includes("File not found");

async function writeFileExecute(
	args: Record<string, unknown>,
): Promise<string> {
	const { path, content } = args as { path: string; content: string };
	const absolutePath = pathResolve(WORKSPACE_ROOT, path);
	validateWorkspacePath(
		absolutePath,
		`'${args.path}' is out of the workspace.`,
	);

	// Traverse parent directories until a valid existing workspace path is found.
	let checkPath = absolutePath;
	while (checkPath !== WORKSPACE_ROOT) {
		try {
			// Note: Non-existent target files and missing parent directories will throw a "File not found" error.
			await validateRealPath(checkPath, path);
			break;
		} catch (error) {
			if (isNotFoundError(error)) {
				checkPath = dirname(checkPath);
				continue;
			}
			throw error;
		}
	}

	const dir = dirname(absolutePath);
	await mkdir(dir, { recursive: true }); // if the directory does not exist

	await fsWriteFile(absolutePath, content, ENCODING);

	return `The file has been successfully written: '${args.path}'`;
}

export const writeFile = {
	name: "writeFile",
	description:
		"This tool creates or overwrites a file at the specified path. If the directory does not exist, it is created automatically.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the file to create or overwrite",
			},
			content: {
				type: "string",
				description: "The contents to write a file",
			},
		},
		required: ["path", "content"],
	},
	execute: writeFileExecute,
	needsApproval: true,
};
