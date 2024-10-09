import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import { threadId } from "worker_threads";
// @ts-expect-error see https://github.com/microsoft/TypeScript/issues/52529, can't import types from .cts to .ts files that are ESM
import type { ProjectConfig } from "./Options";

const logPrefix = `[wds pid=${process.pid} thread=${threadId}]`;
export const log = {
  debug: (...args: any[]) => process.env["WDS_DEBUG"] && console.warn(logPrefix, ...args),
  info: (...args: any[]) => console.warn(logPrefix, ...args),
  warn: (...args: any[]) => console.warn(logPrefix, ...args),
  error: (...args: any[]) => console.error(logPrefix, ...args),
};

export async function time<T>(run: () => Promise<T>) {
  const time = process.hrtime();
  await run();
  const diff = process.hrtime(time);

  return (diff[0] + diff[1] / 1e9).toFixed(5);
}

export const projectConfig = async (root: string): Promise<ProjectConfig> => {
  const location = path.join(root, "wds.js");
  const base: ProjectConfig = {
    ignore: [],
    extensions: [".ts", ".tsx", ".jsx"],
    cacheDir: path.join(root, "node_modules/.cache/wds"),
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

  // absolutize the cacheDir if not already
  if (!result.cacheDir.startsWith("/")) {
    result.cacheDir = path.resolve(path.dirname(location), result.cacheDir);
  }

  return result;
};
