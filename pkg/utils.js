"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectConfig = exports.time = exports.log = void 0;
const fs_1 = require("fs");
const lodash_1 = require("lodash");
const path_1 = __importDefault(require("path"));
const logPrefix = "[esbuild-dev]";
exports.log = {
    debug: (...args) => process.env["ESBUILD_DEV_DEBUG"] && console.warn(logPrefix, ...args),
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
    const location = path_1.default.join(root, "esbuild-dev.js");
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
    return lodash_1.defaults(required, value);
};
exports.projectConfig = projectConfig;
//# sourceMappingURL=utils.js.map