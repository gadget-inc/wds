import fs from "fs";
import path from "path";
import { workerData } from "worker_threads";
import type { SyncWorkerData } from "../SyncWorker.cjs";
import { SyncWorker } from "../SyncWorker.cjs";
import { log, notifyParentProcessOfRequire } from "./utils.cjs";

if (!workerData || !(workerData as SyncWorkerData).isWDSSyncWorker) {
  const worker = new SyncWorker(path.join(__dirname, "compileInLeaderProcess.cjs"));
  const paths: Record<
    string,
    | string
    | {
        ignored: boolean;
      }
  > = {};

  // enable source maps
  process.setSourceMapsEnabled(true);

  // Compile a given file by sending it into our async-to-sync wrapper worker js file
  // The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
  // So, we keep a map of all the files it's compiled so far, and check it first.
  const compileOffThread = (filename: string) => {
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
  // We don't do the best practice of chaining module._compile calls because swc won't know about any of the stuff any of the other extensions might do, so running them wouldn't do anything. wds must then be the first registered extension.
  const extensions = process.env["WDS_EXTENSIONS"]!.split(",");
  log.debug("registering cjs hook for extensions", extensions);
  for (const extension of extensions) {
    require.extensions[extension] = (module: any, filename: string) => {
      const compiledFilename = compileOffThread(filename);
      if (typeof compiledFilename === "string") {
        const content = fs.readFileSync(compiledFilename, "utf8");
        notifyParentProcessOfRequire(filename);
        module._compile(content, filename);
      }
    };
  }

  // monitor the parent process' health, if it dies, kill ourselves so we don't end up a zombie
  const monitor = setInterval(() => {
    try {
      process.kill(process.ppid, 0);
      // No error means the process exists
    } catch (e) {
      // An error means the process does not exist
      log.error("wds parent process crashed, killing child");
      process.kill(-1 * process.pid, "SIGKILL");
    }
  }, 1000);
  monitor.unref();
  process.on("beforeExit", () => {
    clearInterval(monitor);
  });
}
