// have to use a module import like this so we can re-access imported properties as they might change, see https://github.com/nodejs/node/issues/36531
import workerThreads, { MessageChannel, MessagePort, receiveMessageOnPort, Worker } from "worker_threads";
import { log } from "./utils";

log.debug("syncworker file boot", { isMainThread: workerThreads.isMainThread });

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

interface SyncWorkerData {
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
    };

    this.worker = new Worker(__filename, {
      argv: [],
      execArgv: [],
      workerData,
      transferList: [port2],
    });

    log.debug("booted syncworker worker", { filename: __filename, scriptPath, threadId: this.worker.threadId });

    this.worker.on("error", (error) => {
      log.error("[esbuild-dev] Internal error", error);
      process.exit(1);
    });

    this.worker.on("exit", (code) => {
      if (code !== 0) {
        log.error("[esbuild-dev] Internal error, compiler worked exited unexpectedly");
        process.exit(1);
      }
    });

    // Calling unref() on a worker will allow the thread to exit if it's the last only active handle in the event system. This means node will still exit when there are no more event handlers from the main thread. So there's no  need to have a "stop()" function.
    // this.worker.unref();
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

    log.debug("calling syncworker", call);
    this.port.postMessage(call);

    // synchronously wait for worker thread to get back to us
    const status = Atomics.wait(sharedBufferView, 0, 0, 5000);
    if (status === "timed-out") throw new Error("[esbuild-dev] Internal error: timed out communicating with esbuild-dev leader process");
    if (status !== "ok" && status !== "not-equal")
      throw new Error(`[esbuild-dev] Internal error: Atomics.wait() failed with status ${status}`);

    const message = receiveMessageOnPort(this.port);

    if (!message) throw new Error("[esbuild-dev] Internal error: no response received from sync worker thread");
    const response: SyncWorkerResponse = message.message;

    if (response.id != id)
      throw new Error(
        `[esbuild-dev] Internal error: response received from sync worker thread with incorrect id, sent ${id}, recieved ${response.id}`
      );

    if (response.error) throw response.error;

    return response.result;
  }
}

// This file re-executes itself in the worker thread. Actually run the worker code within the inner thread if we're the inner thread
if (!workerThreads.isMainThread) {
  const runWorker = () => {
    // try to be immune to https://github.com/nodejs/node/issues/36531
    const workerData: SyncWorkerData | undefined = workerThreads.workerData;
    if (!workerData) return setImmediate(runWorker as any); // eslint-disable-line @typescript-eslint/no-implied-eval
    log.debug("booted syncworker worker");
    const implementation = require(workerData.scriptPath); // eslint-disable-line @typescript-eslint/no-var-requires
    const port: MessagePort = workerData.port;

    const handleCall = async (call: SyncWorkerCall) => {
      const sharedBufferView = new Int32Array(call.sharedBuffer);

      try {
        const result = await implementation(...call.args);
        port.postMessage({ id: call.id, result });
      } catch (error) {
        port.postMessage({ id: call.id, error });
      }

      // First, change the shared value. That way if the main thread attempts to wait for us after this point, the wait will fail because the shared value has changed.
      Atomics.add(sharedBufferView, 0, 1);
      // Then, wake the main thread. This handles the case where the main thread was already waiting for us before the shared value was changed.
      Atomics.notify(sharedBufferView, 0, Infinity);
    };

    port.on("message", (message) => {
      void handleCall(message.message as SyncWorkerCall);
    });

    let message;
    if ((message = receiveMessageOnPort(port))) {
      void handleCall(message.message as SyncWorkerCall);
    }
  };

  runWorker();
}
