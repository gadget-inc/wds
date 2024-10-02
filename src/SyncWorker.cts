import fs from "fs-extra";
import _ from "lodash";
import { inspect } from "util";
import type { MessagePort } from "worker_threads";
import workerThreads, { isMainThread, MessageChannel, receiveMessageOnPort, threadId, Worker } from "worker_threads";

export let debugLog: ((...args: any[]) => void) | undefined = undefined;

if (process.env["WDS_DEBUG"]) {
  // write logs to a file, not a stdout, since stdio is buffered from worker threads by node and messages are lost on process crash :eyeroll:
  debugLog = (...args: any[]) => {
    const result =
      `[wds syncworker ${isMainThread ? "main" : "inner"} thread=${threadId}] ` +
      args.map((arg) => (typeof arg === "string" ? arg : inspect(arg))).join(" ");

    console.error(result);
    fs.appendFileSync(`/tmp/wds-debug-log-pid-${process.pid}-thread-${threadId}.txt`, result + "\n");
  };
}
debugLog?.("syncworker file boot", { isMainThread: workerThreads.isMainThread, hasWorkerData: !!workerThreads.workerData });

interface SyncWorkerCall {
  id: number;
  args: any[];
  sharedBuffer: SharedArrayBuffer;
}

interface SyncWorkerResponse {
  id: number;
  result: undefined | any;
  error: null | any;
}

export interface SyncWorkerData {
  isWDSSyncWorker: true;
  scriptPath: string;
  port: MessagePort;
}

/**
 * A synchronous wrapper around a worker which can do asynchronous work
 * Useful for us because we need to block the main synchronous thread during requiring something to asynchronously ask the parent to compile stuff for us.
 * Uses Atomics to block the main thread waiting on a SharedArrayBuffer, and then another worker thread to actually do the async stuff in a different event loop.
 * A terrible invention inspired by https://github.com/evanw/esbuild/pull/612/files
 * */
export class SyncWorker {
  port: MessagePort;
  idCounter = 0;
  worker: Worker;

  constructor(scriptPath: string) {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;

    const workerData: SyncWorkerData = {
      scriptPath,
      port: port2,
      isWDSSyncWorker: true,
    };

    this.worker = new Worker(__filename, {
      argv: [],
      execArgv: [],
      workerData,
      transferList: [port2],
    });

    debugLog?.("booted syncworker worker", { filename: __filename, scriptPath, childWorkerThreadId: this.worker.threadId });

    this.worker.on("error", (error) => {
      debugLog?.("Internal error", error);
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

  call(...args: any[]) {
    const id = this.idCounter++;

    const call: SyncWorkerCall = {
      id,
      args,
      // Make a fresh shared buffer for every request. That way we can't have a race where a notification from the previous call overlaps with this call.
      sharedBuffer: new SharedArrayBuffer(8),
    };

    const sharedBufferView = new Int32Array(call.sharedBuffer);

    debugLog?.("calling syncworker", { thisThreadId: threadId, childWorkerThreadId: this.worker.threadId, call });
    this.port.postMessage(call);

    // synchronously wait for worker thread to get back to us
    const status = Atomics.wait(sharedBufferView, 0, 0, 60000);
    if (status === "timed-out")
      throw new Error("[wds] Internal error: timed out communicating with wds sync worker thread, likely an wds bug");
    if (status !== "ok" && status !== "not-equal") throw new Error(`[wds] Internal error: Atomics.wait() failed with status ${status}`);

    const message = receiveMessageOnPort(this.port);

    if (!message) throw new Error("[wds] Internal error: no response received from sync worker thread");
    const response: SyncWorkerResponse = message.message;

    if (response.id != id)
      throw new Error(
        `[wds] Internal error: response received from sync worker thread with incorrect id, sent ${id}, recieved ${response.id}`
      );

    if (response.error) throw response.error;

    return response.result;
  }
}

// This file re-executes itself in the worker thread. Actually run the worker code within the inner thread if we're the inner thread
if (!workerThreads.isMainThread) {
  const runWorker = async () => {
    const workerData: SyncWorkerData | undefined = workerThreads.workerData;
    if (!workerData || !workerData.isWDSSyncWorker) return;

    void debugLog?.("inner sync worker thread booting", { scriptPath: workerData.scriptPath });

    try {
      let implementation = await import(workerData.scriptPath);

      // yes, twice :eyeroll:
      if (implementation.default) implementation = implementation.default;
      if (implementation.default) implementation = implementation.default;

      if (!_.isFunction(implementation))
        throw new Error(
          `[wds] Internal error: sync worker script at ${workerData.scriptPath} did not export a default function, it was a ${inspect(
            implementation
          )}`
        );
      const port: MessagePort = workerData.port;

      const handleCall = async (call: SyncWorkerCall) => {
        const sharedBufferView = new Int32Array(call.sharedBuffer);

        try {
          const result = await implementation(...call.args);
          port.postMessage({ id: call.id, result });
        } catch (error) {
          void debugLog?.("error running syncworker", error);
          port.postMessage({ id: call.id, error });
        }

        // First, change the shared value. That way if the main thread attempts to wait for us after this point, the wait will fail because the shared value has changed.
        Atomics.add(sharedBufferView, 0, 1);
        // Then, wake the main thread. This handles the case where the main thread was already waiting for us before the shared value was changed.
        Atomics.notify(sharedBufferView, 0, Infinity);
      };

      port.addListener("message", (message) => {
        void debugLog?.("got port message", message);
        void handleCall(message as SyncWorkerCall);
      });

      port.addListener("messageerror", (error) => {
        void debugLog?.("got port message error", error);
        console.error("got port message error", error);
      });

      void debugLog?.("sync worker booted\n");
    } catch (error) {
      console.error("error booting inner sync worker thread", error);
      void debugLog?.("error booting inner sync worker thread", error);
      process.exit(1);
    }
  };

  void runWorker();
}
