import type { BuildIncremental } from "esbuild";
import { Compiler } from "./Compiler";
/** Implements TypeScript building using esbuild */
export declare class EsBuildCompiler implements Compiler {
    readonly workspaceRoot: string;
    readonly workDir: string;
    builds: BuildIncremental[];
    fileToBuildMap: {
        [filename: string]: BuildIncremental;
    };
    rootToBuildMap: {
        [filename: string]: BuildIncremental;
    };
    fileToGroupMap: {
        [filename: string]: string[];
    };
    fileToDestinationMap: {
        [filename: string]: string;
    };
    constructor(workspaceRoot: string, workDir: string);
    /**
     * When a file operation occurs that requires setting up all the esbuild builds again, we run this.
     * The operations that should cause an invalidation are:
     *  - a change in the tsconfig.json
     *  - any new file being added
     *  - any existing file being deleted
     *
     * The set of files being built changing causes a reset because esbuild is only incremental over the exact same set of input options passed to it, which includes the files. So we need
     */
    invalidateBuildSet(): Promise<void>;
    /**
     * Start compiling a new file at `filename`.
     **/
    compile(filename: string): Promise<void>;
    /**
     * For a given input filename, return all the destinations of the files compiled alongside it in it's compilation group
     **/
    fileGroup(filename: string): Promise<Record<string, string>>;
    rebuild(): Promise<void>;
    private getModule;
    /**
     * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
     * If a file is part of a project we've seen before, it's a no-op.
     **/
    private startBuilding;
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
    invalidate(filename: string): void;
}
