import { createInterface } from "node:readline";

export async function requestApproval(
	toolName: string,
	toolArgs: Record<string, unknown>,
): Promise<boolean> {
	return new Promise((resolve) => {
		const readline = createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		console.log("\n--- Approval is required to execute the below tool. ---");
		console.log(`Tool Name: ${toolName}`);
		console.log(`Arguments: ${JSON.stringify(toolArgs, null, 2)}`);

		readline.question(
			"Do you approve to execute this tool? (y/N): ",
			(answer) => {
				readline.close();

				if (answer.toLowerCase() === "y") {
					console.log("Tool execution was approved. Running now...\n");
					resolve(true);
				}

				console.log("Tool execution was canceled.\n");
				resolve(false);
			},
		);
	});
}
