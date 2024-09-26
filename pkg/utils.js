"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeFileAtomic = exports.projectConfig = exports.time = exports.log = void 0;
const write_file_atomic_1 = __importDefault(require("write-file-atomic"));
const fs_1 = require("fs");
const lodash_1 = require("lodash");
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const worker_threads_1 = require("worker_threads");
const logPrefix = `[wds pid=${process.pid} thread=${worker_threads_1.threadId}]`;
exports.log = {
    debug: (...args) => process.env["WDS_DEBUG"] && console.warn(logPrefix, ...args),
    info: (...args) => console.warn(logPrefix, ...args),
    warn: (...args) => console.warn(logPrefix, ...args),
    error: (...args) => console.error(logPrefix, ...args),
};
const time = async (run) => {
    const time = process.hrtime();
    await run();
    const diff = process.hrtime(time);
    return (diff[0] + diff[1] / 1e9).toFixed(5);
};
exports.time = time;
const projectConfig = async (root) => {
    const location = path_1.default.join(root, "wds.js");
    const value = { ignore: [], extensions: [".ts", ".tsx", ".jsx"] };
    try {
        await fs_1.promises.access(location);
    }
    catch (error) {
        exports.log.debug(`Not loading project config from ${location}, error encountered: ${error.message}`);
        return value;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const required = require(location);
    exports.log.debug(`Loaded project config from ${location}`);
    return (0, lodash_1.defaults)(required, value);
};
exports.projectConfig = projectConfig;
exports.writeFileAtomic = (0, util_1.promisify)(write_file_atomic_1.default);
// /** 
//  * Write to a file atomically to avoid any moments where two parallel writers might create an empty file on disk
//  **/
// export const atomicWriteFile = async (filePath: string, data: string) => {
//   const tempPath = `${filePath}.${process.pid}.${threadId}.${Math.random().toString(36).substring(2, 15)}`;
//   try {
//     // Write to a temporary file
//     await fs.writeFile(tempPath, data, { flag: 'wx' });
//     // Rename the temporary file to the target file
//     await fs.rename(tempPath, filePath);
//   } catch (error) {
//     // Clean up the temporary file if an error occurred
//     await fs.unlink(tempPath).catch(() => {});
//     throw error;
//   }
// };
//# sourceMappingURL=utils.js.map