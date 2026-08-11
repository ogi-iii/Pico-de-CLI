import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createInterface } from "node:readline";
import { requestApproval } from "./approval";

mock.module("node:readline", () => ({
	createInterface: mock(),
}));

describe("requestApproval", () => {
	let mockRl: {
		question: ReturnType<typeof mock>;
		close: ReturnType<typeof mock>;
	};
	let consoleSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		mockRl = {
			question: mock(),
			close: mock(),
		};
		(createInterface as unknown as ReturnType<typeof mock>).mockReturnValue(
			mockRl,
		);
	});

	it("should return true when user inputs 'y'", async () => {
		mockRl.question.mockImplementation(
			(_query: string, callback: (answer: string) => void) => {
				callback("y");
			},
		);

		const result = await requestApproval("testTool", { key: "value" });

		expect(result).toBe(true);
		expect(mockRl.close).toHaveBeenCalledTimes(1);
		expect(consoleSpy).toHaveBeenCalledWith(
			"\n--- Approval is required to execute the below tool. ---",
		);
		expect(consoleSpy).toHaveBeenCalledWith("Tool Name: testTool");
		expect(consoleSpy).toHaveBeenCalledWith(
			`Arguments: ${JSON.stringify({ key: "value" }, null, 2)}`,
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			"Tool execution was approved. Running now...\n",
		);
	});

	it("should return true when user inputs uppercase 'Y'", async () => {
		mockRl.question.mockImplementation(
			(_query: string, callback: (answer: string) => void) => {
				callback("Y");
			},
		);

		const result = await requestApproval("testTool", null);

		expect(result).toBe(true);
		expect(mockRl.close).toHaveBeenCalledTimes(1);
	});

	it("should return false when user inputs 'n'", async () => {
		mockRl.question.mockImplementation(
			(_query: string, callback: (answer: string) => void) => {
				callback("n");
			},
		);

		const result = await requestApproval("testTool", { key: "value" });

		expect(result).toBe(false);
		expect(mockRl.close).toHaveBeenCalledTimes(1);
		expect(consoleSpy).toHaveBeenCalledWith("Tool execution was canceled.\n");
	});

	it("should return false when user inputs any other arbitrary string", async () => {
		mockRl.question.mockImplementation(
			(_query: string, callback: (answer: string) => void) => {
				callback("invalid input");
			},
		);

		const result = await requestApproval("testTool", {});

		expect(result).toBe(false);
		expect(mockRl.close).toHaveBeenCalledTimes(1);
	});
});
