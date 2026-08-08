import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { readFile } from "./readFile";

const TEST_WORKSPACE_DIR = resolve(
	process.cwd(),
	"./workspace/__temp__/bun/test",
);
const TEMP_WORKSPACE_DIR = resolve(process.cwd(), "./workspace/__temp__");

describe("readFile tool", () => {
	beforeEach(async () => {
		await fs.mkdir(TEST_WORKSPACE_DIR, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(TEMP_WORKSPACE_DIR, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	describe("Successful reads", () => {
		it("should read a valid file inside the workspace", async () => {
			const filePath = join(TEST_WORKSPACE_DIR, "test.txt");
			const content = "Hello, TypeScript!";
			await fs.writeFile(filePath, content, "utf-8");

			const result = await readFile.execute({
				path: "__temp__/bun/test/test.txt",
			});
			expect(result).toBe(content);
		});

		it("should read a valid file in a sub-directory", async () => {
			const subDir = join(TEST_WORKSPACE_DIR, "sub");
			await fs.mkdir(subDir, { recursive: true });
			const filePath = join(subDir, "nested.txt");
			const content = "Nested File Content";
			await fs.writeFile(filePath, content, "utf-8");

			const result = await readFile.execute({
				path: "__temp__/bun/test/sub/nested.txt",
			});
			expect(result).toBe(content);
		});
	});

	describe("Workspace path validation", () => {
		it("should throw an error when attempting directory traversal", async () => {
			await expect(
				readFile.execute({ path: "../outside.txt" }),
			).rejects.toThrow(
				"Access denied: '../outside.txt' is out of the workspace.",
			);
		});

		it("should throw an error when given an absolute path outside the workspace", async () => {
			const outsidePath = resolve(process.cwd(), "outside.txt");
			await expect(readFile.execute({ path: outsidePath })).rejects.toThrow(
				`Access denied: '${outsidePath}' is out of the workspace.`,
			);
		});
	});

	describe("Symbolic link validation", () => {
		it("should throw an error if a symlink targets a file outside the workspace", async () => {
			const outsideFile = resolve(process.cwd(), "outside_dummy.txt");
			await fs.writeFile(outsideFile, "secret data", "utf-8");

			const symlinkPath = join(TEST_WORKSPACE_DIR, "symlink_to_outside.txt");
			await fs.symlink(outsideFile, symlinkPath);

			try {
				await expect(
					readFile.execute({
						path: "__temp__/bun/test/symlink_to_outside.txt",
					}),
				).rejects.toThrow(
					"Access denied: '__temp__/bun/test/symlink_to_outside.txt' refers to a location outside the workspace via a symbolic link.",
				);
			} finally {
				await fs.unlink(outsideFile).catch(() => {});
			}
		});
	});

	describe("File status and existence validation", () => {
		it("should throw a file not found error when the file does not exist", async () => {
			await expect(
				readFile.execute({ path: "__temp__/bun/test/non_existent.txt" }),
			).rejects.toThrow("File not found: __temp__/bun/test/non_existent.txt");
		});

		it("should throw an error if the specified path is a directory", async () => {
			const dirPath = join(TEST_WORKSPACE_DIR, "some_dir");
			await fs.mkdir(dirPath);

			await expect(
				readFile.execute({ path: "__temp__/bun/test/some_dir" }),
			).rejects.toThrow("Not a regular file: '__temp__/bun/test/some_dir'");
		});

		it("should throw an error if the file exceeds the maximum size limit", async () => {
			const largeFilePath = join(TEST_WORKSPACE_DIR, "large.txt");
			const largeBuffer = Buffer.alloc(100 * 1024 + 1);
			await fs.writeFile(largeFilePath, largeBuffer);

			await expect(
				readFile.execute({ path: "__temp__/bun/test/large.txt" }),
			).rejects.toThrow(
				"Too large file to load: __temp__/bun/test/large.txt (100KB)",
			);
		});
	});

	describe("Error handling edge cases", () => {
		it("should rethrow system errors other than ENOENT", async () => {
			const filePath = join(TEST_WORKSPACE_DIR, "eacces.txt");
			await fs.writeFile(filePath, "data");

			const eaccesError = new Error(
				"Permission denied",
			) as NodeJS.ErrnoException;
			eaccesError.code = "EACCES";

			const spy = vi.spyOn(fs, "stat").mockRejectedValue(eaccesError);

			await expect(
				readFile.execute({ path: "__temp__/bun/test/eacces.txt" }),
			).rejects.toThrow("Permission denied");

			spy.mockRestore();
		});

		it("should rethrow non-Error objects", async () => {
			const filePath = join(TEST_WORKSPACE_DIR, "custom_error.txt");
			await fs.writeFile(filePath, "data");

			const spy = vi
				.spyOn(fs, "stat")
				.mockRejectedValue("Unknown string error");

			await expect(
				readFile.execute({ path: "__temp__/bun/test/custom_error.txt" }),
			).rejects.toBe("Unknown string error");

			spy.mockRestore();
		});
	});
});
