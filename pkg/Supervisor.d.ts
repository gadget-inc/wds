/// <reference types="node" />
/// <reference types="node" />
import type { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type { RunOptions } from "./Options";
import type { Project } from "./Project";
/** */
export declare class Supervisor extends EventEmitter {
    readonly argv: string[];
    readonly socketPath: string;
    readonly options: RunOptions;
    readonly project: Project;
    process: ChildProcess;
    constructor(argv: string[], socketPath: string, options: RunOptions, project: Project);
    /**
     * Stop the process with a graceful SIGTERM, then SIGKILL after a timeout
     * Kills the whole process group so that any subprocesses of the process are also killed
     * See https://azimi.me/2014/12/31/kill-child_process-node-js.html for more information
     */
    stop(): Promise<void>;
    kill(signal?: string, pid?: number | undefined): void;
    restart(): ChildProcess;
}
