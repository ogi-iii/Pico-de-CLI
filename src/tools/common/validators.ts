import { realpath } from "node:fs/promises";
import { ALLOWED_PREFIX, WORKSPACE_ROOT } from "./constants";
import { handleNotFoundError } from "./error-handler";

export function validateWorkspacePath(
	filePath: string,
	errorMessage?: string,
): void {
	if (!filePath.startsWith(ALLOWED_PREFIX) && filePath !== WORKSPACE_ROOT) {
		const message = errorMessage || `'${filePath}' is out of the workspace.`;
		throw new Error(`Access denied: ${message}`);
	}
}

export async function validateRealPath(
	filePath: string,
	displayPath: string,
): Promise<string> {
	let realPath: string;
	try {
		realPath = await realpath(filePath);
	} catch (error) {
		handleNotFoundError(error, displayPath);
	}
	validateWorkspacePath(
		realPath,
		`'${displayPath}' refers to a location outside the workspace via a symbolic link.`,
	);
	return realPath;
}
