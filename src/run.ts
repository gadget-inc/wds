import { FSWatcher, watch } from "chokidar";
import { SyncIPCServer } from "node-sync-ipc";
import path from "path";
import readline from "readline";
import { Compiler } from "./Compiler";
import { Supervisor } from "./Supervisor";

const startTerminalCommandListener = (supervisor: Supervisor) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  rl.on("line", (line: string) => {
    if (line.trim() === "rs") {
      supervisor.restart();
    }
  });
};

const startFilesystemWatcher = (supervisor: Supervisor) => {
  const watcher = watch([]);

  supervisor.on("message", (value) => {
    if (value.require) {
      if (!value.require.includes("node_modules")) {
        watcher.add(value.require);
      }
    }
  });

  watcher.on("change", () => supervisor.restart());

  return watcher;
};

const startIPCServer = (
  socketPath: string,
  compiler: Compiler,
  watcher: FSWatcher
) => {
  const server = new SyncIPCServer(socketPath);

  server.onMessage(
    "compile",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (respond: (response: string) => void, filename: string) => {
      try {
        const compiledPath = await compiler.compile(filename);
        respond(compiledPath);
        watcher.add(filename);
      } catch (e) {
        console.error(`Error compiling file ${filename}, can't continue...`);
      }
    }
  );

  return server;
};

const childProcessArgs = () => {
  console.warn({ __dirname });
  return ["-r", path.join(__dirname, "child-process-registration.js")];
};

export interface Options {
  argv: string[];
  restarts: boolean;
}

export const run = async (options: Options) => {
  const compiler = new Compiler();
  await compiler.boot();
  const syncSocketPath = path.join(compiler.workDir, "ipc.sock");

  const supervisor = new Supervisor(
    [...childProcessArgs(), ...options.argv],
    syncSocketPath
  );

  const watcher = startFilesystemWatcher(supervisor);
  const server = startIPCServer(syncSocketPath, compiler, watcher);

  if (options.restarts) startTerminalCommandListener(supervisor);

  // kickoff the first child process
  supervisor.restart();
  console.log("starting esbuild-dev ....");

  process.on("SIGINT", () => {
    supervisor.stop();
    compiler.stop();
    server.stop();
    process.exit(0);
  });
};
