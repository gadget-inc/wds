import * as opentelemetry from "@opentelemetry/api";
import { propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import { throttle } from "lodash";
import process from "process";
import { SyncWorkerData } from "./SyncWorker";
import { setup, shutdown, trace, tracer, wrap } from "./Telemetry";
import { log } from "./utils";

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { SyncWorker } = require("./SyncWorker");
const { workerData } = require("worker_threads");

// TODO: This isn't working.
// I have to look into making it propagage the host context while also
// not quit immediately.
void setup().then(() => {
  const ctx = propagation.extract(ROOT_CONTEXT, process.env);

  const span = tracer.startSpan("child-start-span", undefined, ctx);
  opentelemetry.trace.setSpan(ctx, span);
  process.on("exit", (code) => {
    span.end();
    void shutdown().finally(() => {
      console.log("exit called");
      process.exit(code);
    });
  });
  //
  // traceStartingFromContext("child-process-registration-test", ctx, undefined, () => {
  //
  // })
});

let pendingRequireNotifications: string[] = [];
const throttledRequireFlush = throttle(() => {
  try {
    const request = http.request(
      { socketPath: process.env["ESBUILD_DEV_SOCKET_PATH"]!, path: "/file-required", method: "POST", timeout: 200 },
      () => {
        // don't care if it worked
      },
      300
    );

    request.write(JSON.stringify(pendingRequireNotifications));
    request.end();
    pendingRequireNotifications = [];
  } catch (error) {
    // errors sometimes thrown during shutdown process, we don't care
    log.debug("error flushing require notifications", error);
  }
});

const notifyParentProcessOfRequire = (filename: string) => {
  pendingRequireNotifications.push(filename);
  void throttledRequireFlush();
};

if (!workerData || !(workerData as SyncWorkerData).isESBuildDevWorker) {
  const worker = new SyncWorker(path.join(__dirname, "child-process-ipc-worker.js"));
  const paths: Record<string, string> = {};

  // Compile a given file by sending it into our async-to-sync wrapper worker js file
  // The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
  // So, we keep a map of all the files it's compiled so far, and check it first.
  const compile = wrap("child-process-registration.compile", (filename: string) => {
    let result = paths[filename];
    if (!result) {
      const newPaths = trace("SyncWorker.call", () => worker.call(filename));
      Object.assign(paths, newPaths);
      result = paths[filename];
    }

    if (!result) {
      throw new Error(
        `[esbuild-dev] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`
      );
    }

    return result;
  });

  // Register our compiler for typescript files.
  // We don't do the best practice of chaining module._compile calls because esbuild won't know about any of the stuff any of the other extensions might do, so running them wouldn't do anything. esbuild-dev must then be the first registered extension.
  for (const extension of process.env["ESBUILD_DEV_EXTENSIONS"]!.split(",")) {
    require.extensions[extension] = (module: any, filename: string) => {
      const compiledFilename = compile(filename);
      const content = fs.readFileSync(compiledFilename, "utf8");
      notifyParentProcessOfRequire(filename);
      module._compile(content, filename);
    };
  }
}

log.debug("registering hooks");
process.on("SIGINT", () => {
  log.debug(`child process ${process.pid} got SIGINT`);
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  log.debug(`child process ${process.pid} got SIGTERM`);
  void shutdown().finally(() => process.exit(0));
});
