import { BuildOptions } from "esbuild";
export interface RunOptions {
    argv: string[];
    terminalCommands: boolean;
    reloadOnChanges: boolean;
    supervise: boolean;
}
export interface ProjectConfig {
    ignore: string[];
    esbuild?: BuildOptions;
    extensions: string[];
}
