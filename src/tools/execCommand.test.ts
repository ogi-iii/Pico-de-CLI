import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { execCommand } from "./execCommand";

const mockSpawn = mock();
mock.module("node:child_process", () => ({
	spawn: mockSpawn,
}));

class MockChildProcess extends EventEmitter {
	stdout = new EventEmitter();
	stderr = new EventEmitter();
}

describe("execCommand", () => {
	afterEach(() => {
		mockSpawn.mockClear();
	});

	describe("Tool Metadata", () => {
		it("should have correct tool name, description, and parameter definitions", () => {
			expect(execCommand.name).toBe("execCommand");
			expect(execCommand.description).toContain(
				"executes a command within the workspace",
			);
			expect(execCommand.parameters.required).toEqual(["command"]);
			expect(execCommand.parameters.properties).toHaveProperty("command");
		});
	});

	describe("Parsing & Validation (Input Strategies)", () => {
		it("should throw if no valid strategy matches (no command provided)", async () => {
			await expect(execCommand.execute({ foo: "bar" })).rejects.toThrow(
				"You must specify a command.",
			);
		});

		it("should throw if command is empty", async () => {
			await expect(execCommand.execute({ command: "   " })).rejects.toThrow(
				"Command is empty.",
			);
			await expect(execCommand.execute({ commandName: "" })).rejects.toThrow(
				"Command is empty.",
			);
		});

		it("should throw if the command is not in ALLOWED_COMMANDS", async () => {
			await expect(
				execCommand.execute({ command: "npm install" }),
			).rejects.toThrow("The command 'npm' is not permitted.");
		});

		it("should throw if shell metacharacters are used", async () => {
			await expect(
				execCommand.execute({ command: "ls ; rm -rf /" }),
			).rejects.toThrow(
				"For security reasons, commands containing shell metacharacters cannot be executed.",
			);
			await expect(
				execCommand.execute({ command: "ls | grep foo" }),
			).rejects.toThrow();
			await expect(
				execCommand.execute({ command: "echo $PATH" }),
			).rejects.toThrow();
		});

		it("should throw if a dangerous command pattern is detected", async () => {
			await expect(
				execCommand.execute({ command: "find . -delete" }),
			).rejects.toThrow("A dangerous command pattern was detected.");
			await expect(
				execCommand.execute({ command: "cat > /dev/null" }),
			).rejects.toThrow();
			await expect(
				execCommand.execute({ command: "bun --git-dir" }),
			).rejects.toThrow();
		});

		it("should throw if Strategy 2 'commandArgs' is not an array of strings", async () => {
			await expect(
				execCommand.execute({ commandName: "ls", commandArgs: "not-array" }),
			).rejects.toThrow(
				"'commandArgs' must be specified as an array of strings.",
			);

			await expect(
				execCommand.execute({ commandName: "ls", commandArgs: [123] }),
			).rejects.toThrow(
				"'commandArgs' must be specified as an array of strings.",
			);
		});
	});

	describe("parseCommand (Quote and Escape Logic)", () => {
		it("should correctly parse spaces, quotes, and escaped characters", async () => {
			let parsedArgs: string[] = [];
			mockSpawn.mockImplementation((_cmd, args) => {
				parsedArgs = args;
				const cp = new MockChildProcess();
				setTimeout(() => cp.emit("close", 0), 0);
				return cp;
			});

			const cmdString = `cat "foo \\" bar" 'baz' a\\"b c\\d "foo \\n bar" e  f`;
			await execCommand.execute({ command: cmdString });

			expect(parsedArgs).toEqual([
				'foo " bar',
				"baz",
				'a"b',
				"c\\d",
				"foo n bar",
				"e",
				"f",
			]);
		});

		it("should throw an error on unclosed double quotes", async () => {
			await expect(
				execCommand.execute({ command: `ls "unclosed` }),
			).rejects.toThrow('Unclosed quote: "');
		});

		it("should throw an error on unclosed single quotes", async () => {
			await expect(
				execCommand.execute({ command: `ls 'unclosed` }),
			).rejects.toThrow("Unclosed quote: '");
		});
	});

	describe("Workspace Path Validation", () => {
		it("should allow paths strictly inside the workspace", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => cp.emit("close", 0), 0);
				return cp;
			});

			await expect(
				execCommand.execute({ command: "ls ./src/index.ts" }),
			).resolves.toBeDefined();
		});

		it("should allow paths that resolve exactly to WORKSPACE_ROOT", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => cp.emit("close", 0), 0);
				return cp;
			});

			await expect(
				execCommand.execute({ command: "ls ." }),
			).resolves.toBeDefined();
		});

		it("should deny access to paths outside the workspace", async () => {
			await expect(
				execCommand.execute({ command: "cat ../../etc/passwd" }),
			).rejects.toThrow(
				"Access denied: '../../etc/passwd' is outside the workspace.",
			);

			await expect(
				execCommand.execute({ command: "ls /root" }),
			).rejects.toThrow();
		});
	});

	describe("Execution (Child Process Events & Truncation)", () => {
		it("should resolve with stdout on successful execution", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => {
					cp.stdout.emit("data", Buffer.from("hello world"));
					cp.emit("close", 0);
				}, 0);
				return cp;
			});

			const result = await execCommand.execute({ command: "ls" });
			expect(result).toBe("The command executed successfully: \nhello world");
		});

		it("should resolve with both stdout and stderr on successful execution", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => {
					cp.stdout.emit("data", Buffer.from("stdout msg"));
					cp.stderr.emit("data", Buffer.from("stderr msg"));
					cp.emit("close", 0);
				}, 0);
				return cp;
			});

			const result = await execCommand.execute({ commandName: "ls" });
			expect(result).toBe(
				"The command executed successfully: \nstdout msg\n(stderr: stderr msg)",
			);
		});

		it("should reject on non-zero exit code", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => {
					cp.stderr.emit("data", Buffer.from("File not found"));
					cp.emit("close", 1);
				}, 0);
				return cp;
			});

			await expect(
				execCommand.execute({ command: "cat fake.txt" }),
			).rejects.toThrow(
				"The command terminated abnormally: \nFile not found\n(exit code: 1)",
			);
		});

		it("should reject on process error", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => {
					cp.emit("error", new Error("EACCES"));
				}, 0);
				return cp;
			});

			await expect(execCommand.execute({ command: "ls" })).rejects.toThrow(
				"Failed to execute command: EACCES",
			);
		});

		it("should correctly truncate huge outputs and ignore chunks after limit is reached", async () => {
			mockSpawn.mockImplementation(() => {
				const cp = new MockChildProcess();
				setTimeout(() => {
					cp.stdout.emit("data", Buffer.from("1".repeat(1500)));
					cp.stdout.emit("data", Buffer.from("2".repeat(1000)));
					cp.stdout.emit("data", Buffer.from("3".repeat(1000)));

					cp.stderr.emit("data", Buffer.from("x".repeat(1500)));
					cp.stderr.emit("data", Buffer.from("y".repeat(1000)));
					cp.stderr.emit("data", Buffer.from("z".repeat(1000)));

					cp.emit("close", 0);
				}, 0);
				return cp;
			});

			const result = await execCommand.execute({ command: "cat bigfile" });

			const expectedStdout =
				"1".repeat(1500) +
				"2".repeat(548) +
				"\n... (This output was too long and was truncated.)";

			const expectedStderr =
				"x".repeat(1500) +
				"y".repeat(548) +
				"\n... (This output was too long and was truncated.)";

			expect(result).not.toContain("3");
			expect(result).not.toContain("z");

			expect(result).toBe(
				`The command executed successfully: \n${expectedStdout}\n(stderr: ${expectedStderr})`,
			);
		});
	});
});
