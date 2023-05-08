import type { Options as SwcOptions } from "@swc/core";
import type { BuildOptions } from "esbuild";

type SwcConfig = ".swcrc" | SwcOptions;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
  useEsbuild: boolean;
}

export interface ProjectConfig {
  ignore: string[];
  esbuild?: BuildOptions;
  swc?: SwcConfig;
  extensions: string[];
}
