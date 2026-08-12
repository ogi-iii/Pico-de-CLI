import { beforeEach, describe, expect, it, mock } from "bun:test";
import { loadInstructions } from "./prompt-loader";

const mockExistsSync = mock();
const mockReadFileSync = mock();

mock.module("node:fs", () => {
	return {
		existsSync: mockExistsSync,
		readFileSync: mockReadFileSync,
	};
});

describe("loadInstructions", () => {
	beforeEach(() => {
		mockExistsSync.mockClear();
		mockReadFileSync.mockClear();
	});

	it("should return base instructions when AGENTS.md does not exist", () => {
		mockExistsSync.mockReturnValue(false);
		mockReadFileSync.mockReturnValue("Base instruction content");

		const workspaceRoot = "/path/to/workspace";
		const result = loadInstructions(workspaceRoot);

		expect(result).toBe("Base instruction content");
		expect(mockExistsSync).toHaveBeenCalledWith(`${workspaceRoot}/AGENTS.md`);
		expect(mockReadFileSync).toHaveBeenCalledTimes(1);
	});

	it("should append project instructions when AGENTS.md exists", () => {
		mockExistsSync.mockReturnValue(true);

		mockReadFileSync
			.mockReturnValueOnce("Base instruction content")
			.mockReturnValueOnce("Project instruction content");

		const workspaceRoot = "/path/to/workspace";
		const result = loadInstructions(workspaceRoot);

		const expected =
			"Base instruction content\n\n# Project-specific instructions\n\nProject instruction content";
		expect(result).toBe(expected);

		expect(mockExistsSync).toHaveBeenCalledWith(`${workspaceRoot}/AGENTS.md`);
		expect(mockReadFileSync).toHaveBeenCalledTimes(2);
	});
});
