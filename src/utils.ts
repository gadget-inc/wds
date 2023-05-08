import { promises as fs } from "fs";
import { defaults } from "lodash";
import path from "path";
import type { ProjectConfig } from "./Options";

const logPrefix = `[wds pid=${process.pid}]`;
export const log = {
  debug: (...args: any[]) => process.env["WDS_DEBUG"] && console.warn(logPrefix, ...args),
  info: (...args: any[]) => console.warn(logPrefix, ...args),
  warn: (...args: any[]) => console.warn(logPrefix, ...args),
  error: (...args: any[]) => console.error(logPrefix, ...args),
};

export const time = async <T>(run: () => Promise<T>) => {
  const time = process.hrtime();
  await run();
  const diff = process.hrtime(time);

  return (diff[0] + diff[1] / 1e9).toFixed(5);
};

export const projectConfig = async (root: string): Promise<ProjectConfig> => {
  const location = path.join(root, "wds.js");
  const value = { ignore: [], extensions: [".ts", ".tsx", ".jsx"] };
  try {
    await fs.access(location);
  } catch (error: any) {
    log.debug(`Not loading project config from ${location}, error encountered: ${error.message}`);
    return value;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const required = require(location);
  log.debug(`Loaded project config from ${location}`);
  return defaults(required, value);
};
