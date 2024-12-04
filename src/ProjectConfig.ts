import type { Options as SwcOptions } from "@swc/core";
import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import { log } from "./utils.js";

export type SwcConfig = string | SwcOptions;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
}

export interface ProjectConfig {
  ignore: string[];
  swc?: SwcConfig;
  esm?: boolean;
  extensions: string[];
  cacheDir: string;
}

export const projectConfig = async (root: string): Promise<ProjectConfig> => {
  const location = path.join(root, "wds.js");
  const base: ProjectConfig = {
    ignore: [],
    extensions: [".ts", ".tsx", ".jsx"],
    cacheDir: path.join(root, "node_modules/.cache/wds"),
    esm: true,
  };

  try {
    await fs.access(location);
  } catch (error: any) {
    log.debug(`Not loading project config from ${location}`);
    return base;
  }

  let required = await import(location);
  if (required.default) {
    required = required.default;
  }
  log.debug(`Loaded project config from ${location}`);
  const result = _.defaults(required, base);

  const projectRootDir = path.dirname(location);
  // absolutize the cacheDir if not already
  if (!result.cacheDir.startsWith("/")) {
    result.cacheDir = path.resolve(projectRootDir, result.cacheDir);
  }

  // absolutize the ignore paths if not already
  result.ignore = result.ignore.map((p: string) => (p.startsWith("/") ? p : path.resolve(projectRootDir, p)));

  return result;
};
