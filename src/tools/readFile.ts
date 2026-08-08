import type { Stats } from "node:fs";
import { readFile as fsReadFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const WORKSPACE_ROOT = resolve(process.cwd(), "./workspace");
const ALLOWED_PREFIX = WORKSPACE_ROOT + sep;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const ENCODING = "utf-8";

async function readFileExecute(args: { path: string }): Promise<string> {
	const absolutePath = resolve(WORKSPACE_ROOT, args.path);
	const realPath = await validate(absolutePath, args.path);
	return await fsReadFile(realPath, ENCODING);
}

async function validate(
	filePath: string,
	displayPath: string,
): Promise<string> {
	validateWorkspacePath(filePath, `'${displayPath}' is out of the workspace.`);
	const realPath = await validateRealPath(filePath, displayPath);
	await validateFileStats(realPath, displayPath);
	return realPath;
}

function validateWorkspacePath(filePath: string, errorMessage?: string): void {
	if (!filePath.startsWith(ALLOWED_PREFIX) && filePath !== WORKSPACE_ROOT) {
		const message = errorMessage || `'${filePath}' is out of the workspace.`;
		throw new Error(`Access denied: ${message}`);
	}
}

async function validateRealPath(
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function handleNotFoundError(error: unknown, displayPath: string): never {
	if (isNodeError(error) && error.code === "ENOENT") {
		throw new Error(`File not found: ${displayPath}`);
	}
	throw error;
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
					"Path to the file to load (ex: 'README.md', 'src/index.ts'）",
			},
		},
		required: ["path"],
	},
	execute: readFileExecute,
};
