import { Output } from "@swc/core";
import { Compiler } from "./Compiler";
export declare type CompiledFile = Output & {
    filename: string;
    root: string;
};
export declare type Group = {
    root: string;
    files: Array<CompiledFile>;
};
/** Implements TypeScript building using esbuild */
export declare class SwcCompiler implements Compiler {
    readonly workspaceRoot: string;
    private compiledFiles;
    constructor(workspaceRoot: string);
    invalidateBuildSet(): Promise<void>;
    compile(filename: string): Promise<void>;
    fileGroup(filename: string): Promise<Record<string, string>>;
    private getModule;
    private buildFile;
    /**
     * Build the group of files at the specified path.
     * If the group has already been built, build only the specified file.
     */
    private buildGroup;
    private reportErrors;
    private missingDestination;
    /** The list of globby patterns to use when searching for files to build */
    private fileGlobPatterns;
    /** The list of globby patterns to ignore use when searching for files to build */
    private ignoreFileGlobPatterns;
    /**
     * Detect if a file is being ignored by the ignore glob patterns for a given project
     *
     * Returns false if the file isn't being ignored, or the ignore pattern that is ignoring it if it is.
     */
    private isFilenameIgnored;
}
