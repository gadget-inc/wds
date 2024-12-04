import type { Options as SwcOptions } from "@swc/core";
import fs from "fs-extra";
import _ from "lodash";
import micromatch from "micromatch";
import path from "path";
import { log } from "./utils.js";

export type SwcConfig = string | SwcOptions;

export interface RunOptions {
  argv: string[];
  terminalCommands: boolean;
  reloadOnChanges: boolean;
}

export interface ProjectConfig {
  root: string;
  ignore: string[];
  includeGlob: string;
  includedMatcher: (filePath: string) => boolean;
  swc?: SwcConfig;
  esm?: boolean;
  extensions: string[];
  cacheDir: string;
}

export const projectConfig = _.memoize(async (root: string): Promise<ProjectConfig> => {
  const location = path.join(root, "wds.js");
  const base: ProjectConfig = {
    root,
    extensions: [".ts", ".tsx", ".jsx"],
    cacheDir: path.join(root, "node_modules/.cache/wds"),
    esm: true,
    /** The list of globby patterns to use when searching for files to build */
    includeGlob: `**/*`,
    /** The list of globby patterns to ignore use when searching for files to build */
    ignore: [],
    /** A micromatch matcher for userland checking if a file is included */
    includedMatcher: () => true,
  };

  let exists = false;
  try {
    await fs.access(location);
    exists = true;
  } catch (error: any) {
    log.debug(`Not loading project config from ${location}`);
  }

  let result: ProjectConfig;
  if (exists) {
    let required = await import(location);
    if (required.default) {
      required = required.default;
    }
    log.debug(`Loaded project config from ${location}`);
    result = _.defaults(required, base);
  } else {
    result = base;
  }

  const projectRootDir = path.dirname(location);
  // absolutize the cacheDir if not already
  if (!result.cacheDir.startsWith("/")) {
    result.cacheDir = path.resolve(projectRootDir, result.cacheDir);
  }

  // build inclusion glob and matcher
  result.ignore = _.uniq([`node_modules`, `**/*.d.ts`, `.git/**`, ...result.ignore]);
  result.includeGlob = `**/*{${result.extensions.join(",")}}`;
  result.includedMatcher = micromatch.matcher(result.includeGlob, { cwd: result.root, ignore: result.ignore });

  return result;
});
