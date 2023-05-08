import type { Options as SwcOptions } from "@swc/core";

type SwcConfig = ".swcrc" | SwcOptions;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
}

export interface ProjectConfig {
  ignore: string[];
  swc?: SwcConfig;
  extensions: string[];
}
