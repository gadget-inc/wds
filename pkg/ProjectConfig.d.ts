import type { Options as SwcOptions } from "@swc/core";
import _ from "lodash";
export type SwcConfig = string | SwcOptions;
export interface RunOptions {
    argv: string[];
    terminalCommands: boolean;
    reloadOnChanges: boolean;
}
export interface ProjectConfig {
    root: string;
    ignore: string[];
    includeGlob: string;
    /**
     * Checks if a file should be included in compilation.
     * Accepts both absolute and relative paths (relative to project root).
     * Returns false for files outside the project root.
     */
    includedMatcher: (filePath: string) => boolean;
    swc?: SwcConfig;
    esm?: boolean;
    extensions: string[];
    cacheDir: string;
}
export declare const projectConfig: ((root: string) => Promise<ProjectConfig>) & _.MemoizedFunction;
