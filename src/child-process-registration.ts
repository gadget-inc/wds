import { throttle } from "lodash";
import type { SyncWorkerData } from "./SyncWorker";
import { log } from "./utils";

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { SyncWorker } = require("./SyncWorker");
const { workerData } = require("worker_threads");

let pendingRequireNotifications: string[] = [];
const throttledRequireFlush = throttle(() => {
  try {
    const request = http.request(
      { socketPath: process.env["WDS_SOCKET_PATH"]!, path: "/file-required", method: "POST", timeout: 200 },
      () => {
        // don't care if it worked
      },
      300
    );

    request.on("error", (error: any) => {
      log.debug(`Unexpected request error while flushing require notifications`, error);
    });
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

if (!workerData || !(workerData as SyncWorkerData).isWDSSyncWorker) {
  const worker = new SyncWorker(path.join(__dirname, "child-process-ipc-worker.js"));
  const paths: Record<
    string,
    | string
    | {
        ignored: boolean;
      }
  > = {};

  // Compile a given file by sending it into our async-to-sync wrapper worker js file
  // The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
  // So, we keep a map of all the files it's compiled so far, and check it first.
  const compile = (filename: string) => {
    let result = paths[filename];
    if (!result) {
      const newPaths = worker.call(filename);
      Object.assign(paths, newPaths);
      result = paths[filename];
    }

    if (!result) {
      throw new Error(
        `[wds] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`
      );
    }

    return result;
  };

  // Register our compiler for typescript files.
  // We don't do the best practice of chaining module._compile calls because esbuild won't know about any of the stuff any of the other extensions might do, so running them wouldn't do anything. wds must then be the first registered extension.
  for (const extension of process.env["WDS_EXTENSIONS"]!.split(",")) {
    require.extensions[extension] = (module: any, filename: string) => {
      const compiledFilename = compile(filename);
      if (typeof compiledFilename === "string" || !compiledFilename.ignored) {
        const content = fs.readFileSync(compiledFilename, "utf8");
        notifyParentProcessOfRequire(filename);
        module._compile(content, filename);
      }
    };
  }
}
