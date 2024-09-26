/// <reference types="node" />
import type { ProjectConfig } from "./Options";
export declare const log: {
    debug: (...args: any[]) => void | "" | undefined;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export declare const time: <T>(run: () => Promise<T>) => Promise<string>;
export declare const projectConfig: (root: string) => Promise<ProjectConfig>;
export declare const writeFileAtomic: (arg1: string, arg2: string | Buffer) => Promise<void>;
