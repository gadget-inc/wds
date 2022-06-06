import { Options as SwcOptions } from "@swc/core";
import { BuildOptions } from "esbuild";

type SwcConfig = ".swcrc" | SwcOptions;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
  supervise: boolean;
  useEsbuild: boolean;
}

export interface ProjectConfig {
  ignore: string[];
  esbuild?: BuildOptions;
  swc?: SwcConfig;
  extensions: string[];
}
