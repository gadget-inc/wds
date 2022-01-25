import { Config as SwcConfig } from "@swc/core";
import { BuildOptions } from "esbuild";

type SwcOptions = ".swcrc" | SwcConfig;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
  supervise: boolean;
  useSwc: boolean;
}

export interface ProjectConfig {
  ignore: string[];
  esbuild?: BuildOptions;
  swc?: SwcOptions;
  extensions: string[];
}
