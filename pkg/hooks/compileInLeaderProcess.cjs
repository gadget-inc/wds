"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileInLeaderProcess = compileInLeaderProcess;
/* eslint-disable @typescript-eslint/no-var-requires */
const http_1 = __importDefault(require("http"));
const SyncWorker_cjs_1 = require("../SyncWorker.cjs");
// async function to ask the leader process to do the compilation and hand us back a list of newly compiled source filenames to compiled filenames
async function compileInLeaderProcess(filename) {
    return await new Promise((resolve, reject) => {
        const request = http_1.default.request({ socketPath: process.env["WDS_SOCKET_PATH"], path: "/compile", method: "POST", timeout: 200 }, (resp) => {
            let data = "";
            if (resp.statusCode !== 200) {
                return reject(`Error compiling ${filename}, parent process responded with status ${resp.statusCode}`);
            }
            resp.on("data", (chunk) => (data += chunk));
            resp.on("end", () => resolve(JSON.parse(data).filenames));
        });
        request.on("error", (error) => {
            (0, SyncWorker_cjs_1.debugLog)?.(`Error compiling file ${filename}:`, error);
            reject(error);
        });
        request.write(filename);
        request.end();
    });
}
exports.default = compileInLeaderProcess;
//# sourceMappingURL=compileInLeaderProcess.cjs.map