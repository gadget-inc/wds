"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncWorker = void 0;
// have to use a module import like this so we can re-access imported properties as they might change, see https://github.com/nodejs/node/issues/36531
const fs_1 = require("fs");
const worker_threads_1 = __importStar(require("worker_threads"));
const utils_1 = require("./utils");
utils_1.log.debug("syncworker file boot", { isMainThread: worker_threads_1.default.isMainThread, hasWorkerData: !!worker_threads_1.default.workerData });
/**
 * A synchronous wrapper around a worker which can do asynchronous work
 * Useful for us because we need to block the main synchronous thread during requiring something to asynchronously ask the parent to compile stuff for us.
 * Uses Atomics to block the main thread waiting on a SharedArrayBuffer, and then another worker thread to actually do the async stuff in a different event loop.
 * A terrible invention inspired by https://github.com/evanw/esbuild/pull/612/files
 * */
class SyncWorker {
    constructor(scriptPath) {
        this.idCounter = 0;
        const { port1, port2 } = new worker_threads_1.MessageChannel();
        this.port = port1;
        const workerData = {
            scriptPath,
            port: port2,
            isWDSSyncWorker: true,
        };
        this.worker = new worker_threads_1.Worker(__filename, {
            argv: [],
            execArgv: [],
            workerData,
            transferList: [port2],
        });
        utils_1.log.debug("booted syncworker worker", { filename: __filename, scriptPath, threadId: this.worker.threadId });
        this.worker.on("error", (error) => {
            utils_1.log.error("[wds] Internal error", error);
            process.exit(1);
        });
        this.worker.on("exit", (code) => {
            if (code !== 0) {
                utils_1.log.error("[wds] Internal error, compiler worked exited unexpectedly");
                process.exit(1);
            }
        });
        // Calling unref() on a worker will allow the thread to exit if it's the last only active handle in the event system. This means node will still exit when there are no more event handlers from the main thread. So there's no  need to have a "stop()" function.
        this.worker.unref();
    }
    call(...args) {
        const id = this.idCounter++;
        const call = {
            id,
            args,
            // Make a fresh shared buffer for every request. That way we can't have a race where a notification from the previous call overlaps with this call.
            sharedBuffer: new SharedArrayBuffer(8),
        };
        const sharedBufferView = new Int32Array(call.sharedBuffer);
        utils_1.log.debug("calling syncworker", call);
        this.port.postMessage(call);
        // synchronously wait for worker thread to get back to us
        const status = Atomics.wait(sharedBufferView, 0, 0, 60000);
        if (status === "timed-out")
            throw new Error("[wds] Internal error: timed out communicating with wds sync worker thread, likely an wds bug");
        if (status !== "ok" && status !== "not-equal")
            throw new Error(`[wds] Internal error: Atomics.wait() failed with status ${status}`);
        const message = worker_threads_1.receiveMessageOnPort(this.port);
        if (!message)
            throw new Error("[wds] Internal error: no response received from sync worker thread");
        const response = message.message;
        if (response.id != id)
            throw new Error(`[wds] Internal error: response received from sync worker thread with incorrect id, sent ${id}, recieved ${response.id}`);
        if (response.error)
            throw response.error;
        return response.result;
    }
}
exports.SyncWorker = SyncWorker;
// This file re-executes itself in the worker thread. Actually run the worker code within the inner thread if we're the inner thread
if (!worker_threads_1.default.isMainThread) {
    const runWorker = async () => {
        const workerData = worker_threads_1.default.workerData;
        if (!workerData || !workerData.isWDSSyncWorker)
            return;
        const file = process.env["WDS_DEBUG"] ? await fs_1.promises.open("/tmp/wds-debug-log.txt", "w") : undefined;
        const implementation = require(workerData.scriptPath); // eslint-disable-line @typescript-eslint/no-var-requires
        const port = workerData.port;
        const handleCall = async (call) => {
            const sharedBufferView = new Int32Array(call.sharedBuffer);
            try {
                const result = await implementation(...call.args);
                port.postMessage({ id: call.id, result });
            }
            catch (error) {
                void file?.write(`error running syncworker: ${JSON.stringify(error)}\n`);
                port.postMessage({ id: call.id, error });
            }
            // First, change the shared value. That way if the main thread attempts to wait for us after this point, the wait will fail because the shared value has changed.
            Atomics.add(sharedBufferView, 0, 1);
            // Then, wake the main thread. This handles the case where the main thread was already waiting for us before the shared value was changed.
            Atomics.notify(sharedBufferView, 0, Infinity);
        };
        port.addListener("message", (message) => {
            void file?.write(`got port message: ${JSON.stringify(message)}\n`);
            void handleCall(message);
        });
        port.addListener("messageerror", (error) => {
            void file?.write(`got port message error: ${JSON.stringify(error)}\n`);
            utils_1.log.error("got port message error", error);
        });
        void file?.write(`sync worker booted\n`);
    };
    void runWorker();
}
//# sourceMappingURL=SyncWorker.js.map