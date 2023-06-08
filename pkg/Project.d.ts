import type { FSWatcher } from "chokidar";
import type { Compiler } from "./Compiler";
import type { ProjectConfig } from "./Options";
import type { Supervisor } from "./Supervisor";
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
    watcher?: FSWatcher;
    constructor(workspaceRoot: string, config: ProjectConfig, compiler: Compiler);
    addShutdownCleanup(cleanup: () => void): void;
    enqueueReload(path: string, requiresInvalidation?: boolean): void;
    debouncedReload: import("lodash").DebouncedFunc<() => void>;
    reloadNow(): Promise<void>;
    invalidateBuildSetAndReload(): Promise<void>;
    shutdown(code?: number): Promise<void>;
}
export {};
