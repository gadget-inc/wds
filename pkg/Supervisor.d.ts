/// <reference types="node" />
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { RunOptions } from "./Options";
import { Project } from "./Project";
/** */
export declare class Supervisor extends EventEmitter {
    readonly argv: string[];
    readonly socketPath: string;
    readonly options: RunOptions;
    readonly project: Project;
    process: ChildProcess;
    constructor(argv: string[], socketPath: string, options: RunOptions, project: Project);
    stop(): void;
    kill(): void;
    restart(): ChildProcess;
}
