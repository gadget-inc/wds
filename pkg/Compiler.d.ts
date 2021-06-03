import { ProjectConfig } from "./Options";
interface Build {
    root: string;
    files: string[];
    config: ProjectConfig;
}
/** Implements TypeScript building using esbuild */
export declare class Compiler {
    readonly workspaceRoot: string;
    readonly workDir: string;
    rootToBuildMap: {
        [filename: string]: Build;
    };
    fileToBuildMap: {
        [filename: string]: Promise<Build>;
    };
    fileToDestinationMap: {
        [filename: string]: string;
    };
    constructor(workspaceRoot: string, workDir: string);
    /**
     * Compile a file at `filename` once. Compiles all the files in the project for this filename if it's the first time we're seeing this file.
     *
     * Returns the destination that file's compiled output will be found at in the workdir.
     **/
    compileOne(filename: string): Promise<string>;
    /**
     * Compile all the passed `filenames` once. Returns a map from input to output destination in the workdir for each file.
     **/
    compileSubset(filenames: string[]): Promise<{
        [k: string]: string;
    }>;
    /**
     * Compile all known `filenames` once.
     **/
    compileAll(): Promise<void>;
    fileDestinationGroup(filename: string): Promise<{
        [k: string]: string;
    }>;
    private getBuild;
    /**
     * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
     * If a file is part of a project we've seen before, it's a no-op.
     **/
    private runBuildGroup;
    private reportESBuildErrors;
    private destination;
    private destinationMap;
}
export {};
