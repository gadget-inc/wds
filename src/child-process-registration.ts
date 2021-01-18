/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const { SyncWorker } = require("./SyncWorker");
const { isMainThread } = require("worker_threads");

if (isMainThread) {
  const worker = new SyncWorker(path.join(__dirname, "child-process-ipc-worker.js"));
  const paths: Record<string, string> = {};

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
        `[esbuild-dev] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`
      );
    }

    return result;
  };

  // Register our compiler for typescript files.
  // We don't do the best practice of chaining module._compile calls because esbuild won't know about any of the stuff any of the other extensions might do, so running them wouldn't do anything. esbuild-dev must then be the first registered extension.
  for (const extension of [".tsx", ".ts"]) {
    require.extensions[extension] = (module: any, filename: string) => {
      const compiledFilename = compile(filename);
      const content = fs.readFileSync(compiledFilename, "utf8");
      module._compile(content, filename);
    };
  }
}
