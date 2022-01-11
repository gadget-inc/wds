import type { BuildResult, Metafile, OutputFile } from "esbuild";
import { Compiler } from "./Compiler";
declare type Build = BuildResult & {
    outputFiles: OutputFile[];
    metafile: Metafile;
};
/** Implements TypeScript building using esbuild */
export declare class EsBuildCompiler implements Compiler {
    readonly workspaceRoot: string;
    readonly workDir: string;
    fileToBuildMap: {
        [filename: string]: Build;
    };
    rootToBuildMap: Map<string, Build>;
    fileToGroupMap: {
        [filename: string]: string[];
    };
    fileToContentMap: {
        [filename: string]: string;
    };
    constructor(workspaceRoot: string, workDir: string);
    invalidateBuildSet(): Promise<void>;
    compile(filename: string): Promise<void>;
    fileGroup(filename: string): Promise<Record<string, string>>;
    rebuild(): Promise<void>;
    private getModule;
    /**
     * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
     * If a file is part of a project we've seen before, it's a no-op.
     **/
    private startBuilding;
    private mapFileContent;
    private reportESBuildErrors;
    private destination;
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
export {};
