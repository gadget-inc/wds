import { threadId } from "worker_threads";
const logPrefix = `[wds pid=${process.pid} thread=${threadId}]`;
export const log = {
    debug: (...args) => process.env["WDS_DEBUG"] && console.warn(logPrefix, ...args),
    info: (...args) => console.warn(logPrefix, ...args),
    warn: (...args) => console.warn(logPrefix, ...args),
    error: (...args) => console.error(logPrefix, ...args),
};
export async function time(run) {
    const time = process.hrtime();
    await run();
    const diff = process.hrtime(time);
    return (diff[0] + diff[1] / 1e9).toFixed(5);
}
//# sourceMappingURL=utils.js.map