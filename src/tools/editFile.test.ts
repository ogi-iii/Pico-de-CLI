import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";
import { ENCODING, WORKSPACE_ROOT } from "./common/constants";
import * as validators from "./common/validators";
import { editFile } from "./editFile";

const TEST_WORKSPACE_DIR = pathResolve(
	process.cwd(),
	"./workspace/__temp__/bun/test",
);
const TEMP_WORKSPACE_DIR = pathResolve(process.cwd(), "./workspace/__temp__");

async function cleanupTestDir() {
	if (existsSync(TEMP_WORKSPACE_DIR)) {
		await rm(TEMP_WORKSPACE_DIR, { recursive: true, force: true });
	}
}

describe("editFile", () => {
	beforeAll(async () => {
		await cleanupTestDir();
	});

	afterAll(async () => {
		await cleanupTestDir();
	});

	beforeEach(async () => {
		await cleanupTestDir();
		await mkdir(TEST_WORKSPACE_DIR, { recursive: true });
	});

	afterEach(async () => {
		await cleanupTestDir();
		mock.restore();
	});

	describe("Tool Metadata", () => {
		it("should have correct tool name, description, and parameter definitions", () => {
			expect(editFile.name).toBe("editFile");
			expect(typeof editFile.description).toBe("string");
			expect(editFile.parameters.type).toBe("object");
			expect(editFile.parameters.required).toEqual([
				"path",
				"oldText",
				"newText",
			]);
		});
	});

	describe("execute (editFileExecute)", () => {
		it("should replace text successfully when target text is found exactly once (short text)", async () => {
			const relPath = "__temp__/bun/test/test.txt";
			const fullPath = pathResolve(WORKSPACE_ROOT, relPath);
			const oldText = "hello,";
			const newText = "world,";

			await writeFile(fullPath, "hello, hello_world", ENCODING);

			const result = await editFile.execute({
				path: relPath,
				oldText,
				newText,
			});

			const savedContent = await readFile(fullPath, ENCODING);
			expect(savedContent).toBe("world, hello_world");
			expect(result).toBe(
				`The target text in the file has been successfully replaced from '${oldText.slice(0, 30)}...' to '${newText.slice(0, 30)}...'`,
			);
		});

		it("should replace text successfully when target text is longer than 30 characters", async () => {
			const relPath = "__temp__/bun/test/test.txt";
			const fullPath = pathResolve(WORKSPACE_ROOT, relPath);
			const oldText = "a".repeat(40);
			const newText = "b".repeat(40);
			const content = `${oldText} existing text`;

			await writeFile(fullPath, content, ENCODING);

			const result = await editFile.execute({
				path: relPath,
				oldText,
				newText,
			});

			const expectedOldPreview = oldText.slice(0, 30);
			const expectedNewPreview = newText.slice(0, 30);
			expect(result).toBe(
				`The target text in the file has been successfully replaced from '${expectedOldPreview}...' to '${expectedNewPreview}...'`,
			);
		});

		it("should throw text not found error when target text is missing (short oldText)", async () => {
			const relPath = "__temp__/bun/test/test.txt";
			const fullPath = pathResolve(WORKSPACE_ROOT, relPath);
			const oldText = "missing";

			await writeFile(fullPath, "some other content", ENCODING);

			await expect(
				editFile.execute({
					path: relPath,
					oldText,
					newText: "replacement",
				}),
			).rejects.toThrow(
				`The target text not found in the file: '${oldText}' (path: '${relPath}')`,
			);
		});

		it("should throw text not found error with truncated preview when target text exceeds 50 characters", async () => {
			const relPath = "__temp__/bun/test/test.txt";
			const fullPath = pathResolve(WORKSPACE_ROOT, relPath);
			const oldText = "x".repeat(60);

			await writeFile(fullPath, "some other content", ENCODING);

			const expectedPreview = `${"x".repeat(50)}...`;
			await expect(
				editFile.execute({
					path: relPath,
					oldText,
					newText: "replacement",
				}),
			).rejects.toThrow(
				`The target text not found in the file: '${expectedPreview}' (path: '${relPath}')`,
			);
		});

		it("should throw text multiply found error when target text occurs more than once", async () => {
			const relPath = "__temp__/bun/test/test.txt";
			const fullPath = pathResolve(WORKSPACE_ROOT, relPath);
			const oldText = "duplicate";

			await writeFile(fullPath, "duplicate and duplicate", ENCODING);

			await expect(
				editFile.execute({
					path: relPath,
					oldText,
					newText: "replacement",
				}),
			).rejects.toThrow(
				`The target text multiply found in the file: It needs to specify more specific text (2 matches)`,
			);
		});

		it("should throw an error via validateWorkspacePath when path is outside workspace", async () => {
			const outOfWorkspacePath = "../outside.txt";

			await expect(
				editFile.execute({
					path: outOfWorkspacePath,
					oldText: "old",
					newText: "new",
				}),
			).rejects.toThrow();
		});

		it("should trigger validator functions during execution", async () => {
			const relPath = "__temp__/bun/test/test.txt";
			const fullPath = pathResolve(WORKSPACE_ROOT, relPath);
			await writeFile(fullPath, "valid content", ENCODING);

			const validateWorkspacePathSpy = spyOn(
				validators,
				"validateWorkspacePath",
			);
			const validateRealPathSpy = spyOn(validators, "validateRealPath");

			await editFile.execute({
				path: relPath,
				oldText: "valid",
				newText: "updated",
			});

			expect(validateWorkspacePathSpy).toHaveBeenCalled();
			expect(validateRealPathSpy).toHaveBeenCalled();
		});
	});
});
