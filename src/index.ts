import { FSWatcher, watch } from "chokidar";
import findWorkspaceRoot from "find-yarn-workspace-root";
import { promises as fs } from "fs";
import { SyncIPCServer } from "node-sync-ipc";
import os from "os";
import path from "path";
import pkgDir from "pkg-dir";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Compiler } from "./Compiler";
import { Options } from "./Options";
import { Supervisor } from "./Supervisor";
import { log } from "./utils";

export const cli = async () => {
  const args = yargs(hideBin(process.argv))
    .parserConfiguration({
      "unknown-options-as-args": true,
    })
    .option("commands", {
      alias: "c",
      type: "boolean",
      description:
        "Trigger commands by watching for them on stdin. Prevents stdin from being forwarded to the process. Only command right now is `rs` to restart the server.",
      default: false,
    })
    .option("watch", {
      alias: "w",
      type: "boolean",
      description: "Trigger restarts by watching for changes to required files",
      default: true,
    })
    .option("supervise", {
      alias: "s",
      type: "boolean",
      description:
        "Supervise and restart the process when it exits indefinitely",
      default: false,
    }).argv;

  return esbuildDev({
    argv: args._ as any,
    terminalCommands: args.commands,
    reloadOnChanges: args.watch,
    supervise: args.supervise,
  });
};

const startTerminalCommandListener = (reload: () => Promise<void>) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  rl.on("line", (line: string) => {
    if (line.trim() === "rs") {
      log.info("Restart command recieved, restarting...");
      void reload();
    }
  });
};

const startFilesystemWatcher = (
  workspaceRoot: string,
  supervisor: Supervisor,
  reload: () => Promise<void>
) => {
  const watcher = watch([]);

  supervisor.on("message", (value) => {
    if (value.require) {
      if (!value.require.includes("node_modules")) {
        watcher.add(value.require);
      }
    }
  });

  watcher.on("change", (something) => {
    log.info(`${something.replace(workspaceRoot, "")} changed, restarting...`);
    void reload();
  });

  return watcher;
};

const startIPCServer = (
  socketPath: string,
  compiler: Compiler,
  watcher?: FSWatcher
) => {
  const server = new SyncIPCServer(socketPath);

  server.onMessage(
    "compile",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (respond: (response: string) => void, filename: string) => {
      try {
        const compiledPath = await compiler.compile(filename);
        respond(compiledPath);
        watcher?.add(filename);
      } catch (e) {
        log.error(`Error compiling file ${filename}, can't continue...`, e);
      }
    }
  );

  server.startListen();

  return server;
};

const childProcessArgs = async () => {
  const root = await pkgDir(__dirname);
  return ["-r", path.join(root!, "dist-src", "child-process-registration.js")];
};

export const esbuildDev = async (options: Options) => {
  const workspaceRoot = findWorkspaceRoot(process.cwd()) || process.cwd();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev"));
  const syncSocketPath = path.join(workDir, "ipc.sock");

  const compiler = new Compiler(workspaceRoot, workDir);
  await compiler.boot();

  const supervisor = new Supervisor(
    [...(await childProcessArgs()), ...options.argv],
    syncSocketPath,
    options
  );

  const reload = async () => {
    await compiler.rebuildAll();
    supervisor.restart();
  };

  let watcher;
  if (options.reloadOnChanges)
    watcher = startFilesystemWatcher(workspaceRoot, supervisor, reload);
  if (options.terminalCommands) startTerminalCommandListener(reload);

  const server = startIPCServer(syncSocketPath, compiler, watcher);

  const shutdown = (code = 0) => {
    supervisor.stop();
    compiler.stop();
    server.stop();
    process.exit(code);
  };

  process.on("SIGINT", () => {
    shutdown(0);
  });

  // kickoff the first child process
  options.supervise &&
    log.info(`supervisor starting (working in ${workDir}) ...`);

  await reload();

  if (!options.supervise) {
    supervisor.process.on("exit", (code) => shutdown(code || 0));
  }
};
