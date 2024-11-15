import type { Options as SwcOptions } from "@swc/core";

export type SwcConfig = string | SwcOptions;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
}

export interface ProjectConfig {
  ignore: string[];
  swc?: SwcConfig;
  extensions: string[];
  cacheDir: string;
}
