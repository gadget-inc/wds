"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncWorker = exports.debugLog = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const lodash_1 = __importDefault(require("lodash"));
const util_1 = require("util");
const worker_threads_1 = __importStar(require("worker_threads"));
exports.debugLog = undefined;
if (process.env["WDS_DEBUG"]) {
    // write logs to a file, not a stdout, since stdio is buffered from worker threads by node and messages are lost on process crash :eyeroll:
    exports.debugLog = (...args) => {
        const result = `[wds syncworker ${worker_threads_1.isMainThread ? "main" : "inner"} thread=${worker_threads_1.threadId}] ` +
            args.map((arg) => (typeof arg === "string" ? arg : (0, util_1.inspect)(arg))).join(" ");
        console.error(result);
        fs_extra_1.default.appendFileSync(`/tmp/wds-debug-log-pid-${process.pid}-thread-${worker_threads_1.threadId}.txt`, result + "\n");
    };
}
(0, exports.debugLog)?.("syncworker file boot", { isMainThread: worker_threads_1.default.isMainThread, hasWorkerData: !!worker_threads_1.default.workerData });
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
        (0, exports.debugLog)?.("booted syncworker worker", { filename: __filename, scriptPath, childWorkerThreadId: this.worker.threadId });
        this.worker.on("error", (error) => {
            (0, exports.debugLog)?.("Internal error", error);
            process.exit(1);
        });
        this.worker.on("exit", (code) => {
            if (code !== 0) {
                console.error(`Internal error, compiler worker exited unexpectedly with exit code ${code}`);
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
        (0, exports.debugLog)?.("calling syncworker", { thisThreadId: worker_threads_1.threadId, childWorkerThreadId: this.worker.threadId, call });
        this.port.postMessage(call);
        // synchronously wait for worker thread to get back to us
        const status = Atomics.wait(sharedBufferView, 0, 0, 60000);
        if (status === "timed-out")
            throw new Error("[wds] Internal error: timed out communicating with wds sync worker thread, likely an wds bug");
        if (status !== "ok" && status !== "not-equal")
            throw new Error(`[wds] Internal error: Atomics.wait() failed with status ${status}`);
        const message = (0, worker_threads_1.receiveMessageOnPort)(this.port);
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
        void (0, exports.debugLog)?.("inner sync worker thread booting", { scriptPath: workerData.scriptPath });
        try {
            let implementation = await import(workerData.scriptPath);
            // yes, twice :eyeroll:
            if (implementation.default)
                implementation = implementation.default;
            if (implementation.default)
                implementation = implementation.default;
            if (!lodash_1.default.isFunction(implementation))
                throw new Error(`[wds] Internal error: sync worker script at ${workerData.scriptPath} did not export a default function, it was a ${(0, util_1.inspect)(implementation)}`);
            const port = workerData.port;
            const handleCall = async (call) => {
                const sharedBufferView = new Int32Array(call.sharedBuffer);
                try {
                    const result = await implementation(...call.args);
                    void (0, exports.debugLog)?.("syncworker result", result);
                    port.postMessage({ id: call.id, result });
                }
                catch (error) {
                    void (0, exports.debugLog)?.("error running syncworker", error);
                    port.postMessage({ id: call.id, error });
                }
                // First, change the shared value. That way if the main thread attempts to wait for us after this point, the wait will fail because the shared value has changed.
                Atomics.add(sharedBufferView, 0, 1);
                // Then, wake the main thread. This handles the case where the main thread was already waiting for us before the shared value was changed.
                Atomics.notify(sharedBufferView, 0, Infinity);
            };
            port.addListener("message", (message) => {
                void (0, exports.debugLog)?.("got port message", message);
                void handleCall(message);
            });
            port.addListener("messageerror", (error) => {
                void (0, exports.debugLog)?.("got port message error", error);
                console.error("got port message error", error);
            });
            void (0, exports.debugLog)?.("sync worker booted\n");
        }
        catch (error) {
            console.error("error booting inner sync worker thread", error);
            void (0, exports.debugLog)?.("error booting inner sync worker thread", error);
            process.exit(1);
        }
    };
    void runWorker();
}
//# sourceMappingURL=SyncWorker.cjs.map