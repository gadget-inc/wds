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
    const base = {
        ignore: [],
        extensions: [".ts", ".tsx", ".jsx"],
        cacheDir: path.join(root, "node_modules/.cache/wds"),
    };
    try {
        await fs.access(location);
    }
    catch (error) {
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
//# sourceMappingURL=utils.js.map