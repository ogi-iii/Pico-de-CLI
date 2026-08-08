import { resolve } from "node:path";

export const WORKSPACE_ROOT = resolve(process.cwd(), "./workspace");
export const MAX_FILE_SIZE = 100 * 1024; // 100KB
export const ENCODING = "utf-8";
