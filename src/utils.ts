import { promises as fs } from "fs";
import { defaults } from "lodash";
import path from "path";
import { ProjectConfig } from "./Options";

const logPrefix = "[esbuild-dev]";
export const log = {
  debug: (...args: any[]) => process.env["ESBUILD_DEV_DEBUG"] && console.warn(logPrefix, ...args),
  info: (...args: any[]) => console.warn(logPrefix, ...args),
  warn: (...args: any[]) => console.warn(logPrefix, ...args),
  error: (...args: any[]) => console.error(logPrefix, ...args),
};

export const time = async <T extends any>(run: () => Promise<T>) => {
  const time = process.hrtime();
  await run();
  const diff = process.hrtime(time);

  return (diff[0] + diff[1] / 1e9).toFixed(5);
};

export const projectConfig = async (root: string): Promise<ProjectConfig> => {
  const location = path.join(root, "esbuild-dev.js");
  let value = {};
  try {
    await fs.access(location);
    value = require(location);
    log.debug(`Loaded project config from ${location}`);
  } catch (error) {
    log.debug(`Error loading project config from ${location}: ${error.message}`);
  }
  return defaults({}, value, { ignore: [], extensions: [".ts", ".tsx", ".jsx"] });
};
