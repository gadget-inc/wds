"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const worker_threads_1 = require("worker_threads");
const SyncWorker_cjs_1 = require("../SyncWorker.cjs");
const utils_cjs_1 = require("./utils.cjs");
if (!worker_threads_1.workerData || !worker_threads_1.workerData.isWDSSyncWorker) {
    const worker = new SyncWorker_cjs_1.SyncWorker(path_1.default.join(__dirname, "compileInLeaderProcess.cjs"));
    const paths = {};
    // enable source maps
    process.setSourceMapsEnabled(true);
    // Compile a given file by sending it into our async-to-sync wrapper worker js file
    // The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
    // So, we keep a map of all the files it's compiled so far, and check it first.
    const compileOffThread = (filename) => {
        let result = paths[filename];
        if (!result) {
            const newPaths = worker.call(filename);
            Object.assign(paths, newPaths);
            result = paths[filename];
        }
        if (!result) {
            throw new Error(`[wds] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`);
        }
        return result;
    };
    // Register our compiler for typescript files.
    // We don't do the best practice of chaining module._compile calls because swc won't know about any of the stuff any of the other extensions might do, so running them wouldn't do anything. wds must then be the first registered extension.
    const extensions = process.env["WDS_EXTENSIONS"].split(",");
    utils_cjs_1.log.debug("registering cjs hook for extensions", extensions);
    for (const extension of extensions) {
        require.extensions[extension] = (module, filename) => {
            const compiledFilename = compileOffThread(filename);
            if (typeof compiledFilename === "string") {
                const content = fs_1.default.readFileSync(compiledFilename, "utf8");
                (0, utils_cjs_1.notifyParentProcessOfRequire)(filename);
                module._compile(content, filename);
            }
        };
    }
    // monitor the parent process' health, if it dies, kill ourselves so we don't end up a zombie
    const monitor = setInterval(() => {
        try {
            process.kill(process.ppid, 0);
            // No error means the process exists
        }
        catch (e) {
            // An error means the process does not exist
            utils_cjs_1.log.error("wds parent process crashed, killing child");
            process.kill(-1 * process.pid, "SIGKILL");
        }
    }, 1000);
    monitor.unref();
    process.on("beforeExit", () => {
        clearInterval(monitor);
    });
}
//# sourceMappingURL=child-process-cjs-hook.cjs.map