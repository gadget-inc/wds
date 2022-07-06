/// <reference types="node" />
import { MessagePort, Worker } from "worker_threads";
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
export declare class SyncWorker {
    port: MessagePort;
    idCounter: number;
    worker: Worker;
    constructor(scriptPath: string);
    call(...args: any[]): any;
}
