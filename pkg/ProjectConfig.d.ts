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
     * Checks if a file or directory should be included/watched.
     * Only accepts absolute paths.
     * - For files with extensions: checks extension match and ignore patterns
     * - For directories/extensionless files: checks ignore patterns only
     * Files outside the project root are allowed to support monorepo/workspace scenarios.
     */
    includedMatcher: (absoluteFilePath: string) => boolean;
    swc?: SwcConfig;
    esm?: boolean;
    extensions: string[];
    cacheDir: string;
}
export declare const projectConfig: ((root: string) => Promise<ProjectConfig>) & _.MemoizedFunction;
