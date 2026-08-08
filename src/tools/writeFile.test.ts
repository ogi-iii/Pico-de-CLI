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
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { ENCODING, WORKSPACE_ROOT } from "./common/constants";
import * as validators from "./common/validators";
import { writeFile } from "./writeFile";

const TEST_WORKSPACE_DIR = resolve(
	process.cwd(),
	"./workspace/__temp__/bun/test",
);
const TEMP_WORKSPACE_DIR = resolve(process.cwd(), "./workspace/__temp__");

async function cleanupTestDir() {
	if (existsSync(TEMP_WORKSPACE_DIR)) {
		await rm(TEMP_WORKSPACE_DIR, { recursive: true, force: true });
	}
}

describe("writeFile", () => {
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
			expect(writeFile.name).toBe("writeFile");
			expect(writeFile.description).toContain("creates or overwrites a file");
			expect(writeFile.parameters.required).toEqual(["path", "content"]);
			expect(writeFile.parameters.properties.path.type).toBe("string");
			expect(writeFile.parameters.properties.content.type).toBe("string");
		});
	});

	describe("execute (writeFileExecute)", () => {
		it("should create a new file successfully (including parent directories)", async () => {
			const relPath = "__temp__/bun/test/sub/dir/test.txt";
			const content = "Hello, World!";

			const result = await writeFile.execute({ path: relPath, content });

			const fullPath = resolve(WORKSPACE_ROOT, relPath);
			expect(existsSync(fullPath)).toBe(true);
			const savedContent = await readFile(fullPath, ENCODING);
			expect(savedContent).toBe(content);
			expect(result).toBe(`The file has been written: '${relPath}'`);
		});

		it("should overwrite an existing file", async () => {
			const relPath = "__temp__/bun/test/overwrite.txt";
			const initialContent = "Initial";
			const newContent = "Updated Content";

			await writeFile.execute({ path: relPath, content: initialContent });
			const result = await writeFile.execute({
				path: relPath,
				content: newContent,
			});

			const fullPath = resolve(WORKSPACE_ROOT, relPath);
			const savedContent = await readFile(fullPath, ENCODING);
			expect(savedContent).toBe(newContent);
			expect(result).toBe(`The file has been written: '${relPath}'`);
		});

		it("should traverse parent directories while handling 'File not found' errors", async () => {
			const relPath = "__temp__/bun/test/deep/nested/path/file.txt";
			const content = "Deep file content";

			const validateRealPathSpy = spyOn(
				validators,
				"validateRealPath",
			).mockImplementation(async (checkPath: string, _origPath: string) => {
				if (!existsSync(checkPath)) {
					const err = new Error("File not found");
					throw err;
				}
				return "unexpected value";
			});

			const result = await writeFile.execute({ path: relPath, content });

			expect(validateRealPathSpy).toHaveBeenCalled();
			expect(result).toBe(`The file has been written: '${relPath}'`);

			validateRealPathSpy.mockRestore();
		});

		it("should rethrow errors when isNotFoundError evaluates to false", async () => {
			const relPath = "restricted/file.txt";

			const validateRealPathSpy = spyOn(
				validators,
				"validateRealPath",
			).mockImplementation(async () => {
				throw new Error("Permission denied or access control error");
			});

			expect(
				writeFile.execute({ path: relPath, content: "test" }),
			).rejects.toThrow("Permission denied or access control error");

			validateRealPathSpy.mockRestore();
		});

		it("should rethrow non-Error objects when isErrorWithMessage evaluates to false", async () => {
			const relPath = "non-error-throw/file.txt";

			const validateRealPathSpy = spyOn(
				validators,
				"validateRealPath",
			).mockImplementation(async () => {
				throw "Raw string error";
			});

			expect(
				writeFile.execute({ path: relPath, content: "test" }),
			).rejects.toBe("Raw string error");

			validateRealPathSpy.mockRestore();
		});

		it("should throw an error via validateWorkspacePath when path is outside workspace", async () => {
			const outOfWorkspacePath = "../outside.txt";

			expect(
				writeFile.execute({ path: outOfWorkspacePath, content: "invalid" }),
			).rejects.toThrow();
		});
	});
});
