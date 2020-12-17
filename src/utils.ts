const logPrefix = "[esbuild-dev]";
export const log = {
  debug: (...args: any[]) =>
    process.env["ESBUILD_DEV_DEBUG"] && console.log(logPrefix, ...args),
  info: (...args: any[]) => console.log(logPrefix, ...args),
  warn: (...args: any[]) => console.warn(logPrefix, ...args),
  error: (...args: any[]) => console.error(logPrefix, ...args),
};

export const time = async <T extends any>(run: () => Promise<T>) => {
  const time = process.hrtime();
  await run();
  const diff = process.hrtime(time);

  return (diff[0] + diff[1] / 1e9).toFixed(5);
};
