import type { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type { Project } from "./Project.js";
import type { RunOptions } from "./ProjectConfig.js";
/** */
export declare class Supervisor extends EventEmitter {
    readonly argv: string[];
    readonly socketPath: string;
    readonly options: RunOptions;
    readonly project: Project;
    process: ChildProcess;
    private stopping?;
    constructor(argv: string[], socketPath: string, options: RunOptions, project: Project);
    /**
     * Stop the process with a given signal, then SIGKILL after a timeout
     * First signals only the ref'd process; once it exits, signal the rest of the process group.
     * Falls back to SIGKILL on the group if the ref'd process doesn't exit in time.
     * See https://azimi.me/2014/12/31/kill-child_process-node-js.html for more information
     */
    stop(signal?: NodeJS.Signals): Promise<void>;
    restart(): ChildProcess;
    private kill;
}
