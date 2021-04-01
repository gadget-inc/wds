import type { BuildIncremental } from "esbuild";
/** Implements TypeScript building using esbuild */
export declare class Compiler {
    readonly workspaceRoot: string;
    readonly workDir: string;
    builds: BuildIncremental[];
    fileMap: {
        [filename: string]: BuildIncremental;
    };
    rootMap: {
        [filename: string]: BuildIncremental;
    };
    groupMap: {
        [filename: string]: string[];
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
     * Start compiling a new file at `filename`. Returns the destination that file's compiled output will be found at in the workdir
     **/
    compile(filename: string): Promise<string>;
    /**
     * For a given input filename, return all the destinations of the files compiled alongside it in it's compilation group
     **/
    fileGroup(filename: string): {
        [k: string]: string;
    };
    rebuild(): Promise<void>;
    private getModule;
    /**
     * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
     * If a file is part of a project we've seen before, it's a no-op.
     **/
    private startBuilding;
    private reportESBuildErrors;
    private destination;
}
