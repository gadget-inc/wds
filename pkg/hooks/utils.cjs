"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyParentProcessOfRequire = exports.log = void 0;
const http_1 = __importDefault(require("http"));
const lodash_1 = __importDefault(require("lodash"));
const worker_threads_1 = require("worker_threads");
const logPrefix = `[wds pid=${process.pid} thread=${worker_threads_1.threadId}]`;
exports.log = {
    debug: (...args) => process.env["WDS_DEBUG"] && console.warn(logPrefix, ...args),
    info: (...args) => console.warn(logPrefix, ...args),
    warn: (...args) => console.warn(logPrefix, ...args),
    error: (...args) => console.error(logPrefix, ...args),
};
let pendingRequireNotifications = [];
const throttledRequireFlush = lodash_1.default.throttle(() => {
    try {
        const options = { socketPath: process.env["WDS_SOCKET_PATH"], path: "/file-required", method: "POST", timeout: 300 };
        const request = http_1.default.request(options, () => {
            // don't care if it worked
        });
        request.on("error", (error) => {
            exports.log.debug(`Unexpected request error while flushing require notifications`, error);
        });
        request.write(JSON.stringify(pendingRequireNotifications));
        request.end();
        pendingRequireNotifications = [];
    }
    catch (error) {
        // errors sometimes thrown during shutdown process, we don't care
        exports.log.debug("error flushing require notifications", error);
    }
});
const notifyParentProcessOfRequire = (filename) => {
    pendingRequireNotifications.push(filename);
    void throttledRequireFlush();
};
exports.notifyParentProcessOfRequire = notifyParentProcessOfRequire;
//# sourceMappingURL=utils.cjs.map