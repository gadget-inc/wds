import _ from "lodash";
import type { Compiler } from "./Compiler.js";
import { PathTrie } from "./PathTrie.js";
import type { ProjectConfig } from "./ProjectConfig.js";
import type { Supervisor } from "./Supervisor.js";
interface ReloadBatch {
    paths: string[];
    invalidate: boolean;
}
/** Orchestrates all the other bits to respond to high level commands */
export declare class Project {
    readonly workspaceRoot: string;
    readonly config: ProjectConfig;
    readonly compiler: Compiler;
    cleanups: (() => void)[];
    currentBatch: ReloadBatch;
    supervisor: Supervisor;
    watched: PathTrie;
    constructor(workspaceRoot: string, config: ProjectConfig, compiler: Compiler);
    addShutdownCleanup(cleanup: () => void): void;
    enqueueReload(path: string, requiresInvalidation?: boolean): void;
    debouncedReload: _.DebouncedFunc<() => void>;
    reloadNow(): Promise<void>;
    invalidateBuildSetAndReload(): Promise<void>;
    shutdown(code?: number): Promise<void>;
    watchFile(path: string): void;
}
export {};
