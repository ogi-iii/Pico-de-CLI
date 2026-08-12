import {
	existsSync as fsExistsSync,
	readFileSync as fsReadFileSync,
} from "node:fs";
import { join as pathJoin, resolve as pathResolve } from "node:path";
import { ENCODING } from "../tools/common/constants";

export function loadInstructions(workspaceRoot: string): string {
	const basePath = pathResolve(__dirname, "instructions/prompt.md");
	const baseInstructions = fsReadFileSync(basePath, ENCODING);

	const agentsMdPath = pathJoin(workspaceRoot, "AGENTS.md");
	if (fsExistsSync(agentsMdPath)) {
		const projectInstructions = fsReadFileSync(agentsMdPath, ENCODING);
		return `${baseInstructions}\n\n# Project-specific instructions\n\n${projectInstructions}`;
	}

	return baseInstructions;
}
