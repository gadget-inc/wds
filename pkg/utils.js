import fs from "fs-extra";
import _ from "lodash";
import path from "path";
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
export const projectConfig = async (root) => {
    const location = path.join(root, "wds.js");
    const value = { ignore: [], extensions: [".ts", ".tsx", ".jsx"] };
    try {
        await fs.access(location);
    }
    catch (error) {
        log.debug(`Not loading project config from ${location}`);
        return value;
    }
    let required = await import(location);
    if (required.default) {
        required = required.default;
    }
    log.debug(`Loaded project config from ${location}`);
    return _.defaults(required, value);
};
//# sourceMappingURL=utils.js.map