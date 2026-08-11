import { editFile } from "./editFile";
import { execCommand } from "./execCommand";
import { readFile } from "./readFile";
import { writeFile } from "./writeFile";

export const allTools = [readFile, writeFile, editFile, execCommand];
