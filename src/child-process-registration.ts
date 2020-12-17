import fs from "fs";
import { SyncIPCClient } from "node-sync-ipc";

const client = new SyncIPCClient(process.env["ESBUILD_DEV_SOCKET_PATH"]);

const compile = (filename: string) => {
  return client.sendSync("compile", filename);
};

for (const extension of [".tsx", ".ts"]) {
  // we don't do the best practice of chaining module._compile calls because esbuild won't know about any of the stuff any of the other extensions might do, so running them wouldn't do anything. esbuild-dev must then be the first registered extension.
  require.extensions[extension] = (module: any, filename) => {
    const compiledFilename = compile(filename);
    const content = fs.readFileSync(compiledFilename, "utf8");
    module._compile(content, filename);
  };
}
