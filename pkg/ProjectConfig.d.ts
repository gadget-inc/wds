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
     * Only accepts absolute paths. Returns false for files that are ignored or don't match configured extensions.
     * Files outside the project root are allowed to support monorepo/workspace scenarios.
     */
    includedMatcher: (absoluteFilePath: string) => boolean;
    swc?: SwcConfig;
    esm?: boolean;
    extensions: string[];
    cacheDir: string;
}
export declare const projectConfig: ((root: string) => Promise<ProjectConfig>) & _.MemoizedFunction;
