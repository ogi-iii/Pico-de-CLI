import { resolve as pathResolve, sep } from "node:path";

export const WORKSPACE_ROOT = pathResolve(process.cwd(), "./workspace");
export const ALLOWED_PREFIX = WORKSPACE_ROOT + sep;
export const MAX_FILE_SIZE = 100 * 1024; // 100 KB
export const ENCODING = "utf-8";
