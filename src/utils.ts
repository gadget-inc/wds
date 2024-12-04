import { threadId } from "worker_threads";
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
