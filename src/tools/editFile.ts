import { readFile, writeFile } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";
import { ENCODING, WORKSPACE_ROOT } from "./common/constants";
import { validateRealPath, validateWorkspacePath } from "./common/validators";

function validate(filePath: string, displayPath: string): void {
	validateWorkspacePath(filePath, `'${displayPath}' is out of the workspace.`);
	validateRealPath(filePath, displayPath);
}

function throwTextNotFoundError(oldText: string, filePath: string): void {
	const preview = oldText.length > 50 ? `${oldText.slice(0, 50)}...` : oldText;
	throw new Error(
		`The target text not found in the file: '${preview}' (path: '${filePath}')`,
	);
}

function throwTextUnmatchedError(
	matches: number,
	oldText: string,
	filePath: string,
): void {
	if (matches === 0) {
		throwTextNotFoundError(oldText, filePath);
	}
	// 2 or more matches
	throw new Error(
		`The target text multiply found in the file: Please specify more specific text (${matches} matches)`,
	);
}

async function editFileExecute(args: Record<string, unknown>): Promise<string> {
	const { path, oldText, newText } = args as {
		path: string;
		oldText: string;
		newText: string;
	};
	const absolutePath = pathResolve(WORKSPACE_ROOT, path);
	validate(absolutePath, path);

	const content = await readFile(absolutePath, ENCODING);

	const matches = content.split(oldText).length - 1;
	if (matches !== 1) {
		throwTextUnmatchedError(matches, oldText, path);
	}

	const newContent = content.replace(oldText, newText);
	await writeFile(absolutePath, newContent, ENCODING);

	return `The target text in the file has been successfully replaced from '${oldText.slice(0, 30)}...' to '${newText.slice(0, 30)}...'`;
}

export const editFile = {
	name: "editFile",
	description:
		"This tool edits a portion of a file by replacing the text specified by oldText with newText. If multiple occurrences of oldText are found, an error is returned, so specify a range of the text that uniquely identifies the target. It consumes fewer tokens than reading and writing the entire file.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the file to edit",
			},
			oldText: {
				type: "string",
				description:
					"The text to be replaced (must uniquely identify the target)",
			},
			newText: {
				type: "string",
				description: "The replacement text",
			},
		},
		required: ["path", "oldText", "newText"],
	},
	execute: editFileExecute,
};
