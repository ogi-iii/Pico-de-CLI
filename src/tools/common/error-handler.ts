export function isErrorWithMessage(
	error: unknown,
): error is NodeJS.ErrnoException {
	return error instanceof Error && "message" in error;
}

function isErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

export function handleNotFoundError(
	error: unknown,
	displayPath: string,
): never {
	if (isErrorWithCode(error) && error.code === "ENOENT") {
		throw new Error(`File not found: ${displayPath}`);
	}
	throw error;
}
