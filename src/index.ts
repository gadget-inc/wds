import { FSWatcher, watch } from "chokidar";
import findWorkspaceRoot from "find-yarn-workspace-root";
import { promises as fs } from "fs";
import { SyncIPCServer } from "node-sync-ipc";
import os from "os";
import path from "path";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Commands } from "./Commands";
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

const startTerminalCommandListener = (commands: Commands) => {
  const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  reader.on("line", (line: string) => {
    if (line.trim() === "rs") {
      log.info("Restart command recieved, restarting...");
      void commands.invalidateBuildSetAndReload();
    }
  });

  commands.addShutdownCleanup(() => reader.close());

  return reader;
};

const startFilesystemWatcher = (workspaceRoot: string, commands: Commands) => {
  const watcher = watch([], { ignoreInitial: true });

  commands.supervisor.on("message", (value) => {
    if (value.require) {
      if (!value.require.includes("node_modules")) {
        watcher.add(value.require);
      }
    }
  });

  const reload = (path: string) => {
    log.info(`${path.replace(workspaceRoot, "")} changed, restarting...`);
    void commands.reload();
  };

  const reloadAndNotify = (path: string) => {
    log.info(
      `${path.replace(
        workspaceRoot,
        ""
      )} changed, reinitializing and restarting...`
    );
    void commands.invalidateBuildSetAndReload();
  };

  watcher.on("change", reload);
  watcher.on("add", reloadAndNotify);
  watcher.on("addDir", reloadAndNotify);
  watcher.on("unlink", reloadAndNotify);
  watcher.on("unlinkDir", reloadAndNotify);

  commands.addShutdownCleanup(() => void watcher.close());

  return watcher;
};

const startIPCServer = (
  socketPath: string,
  commands: Commands,
  watcher?: FSWatcher
) => {
  const server = new SyncIPCServer(socketPath);

  server.onMessage(
    "compile",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (respond: (response: string) => void, filename: string) => {
      try {
        const compiledPath = await commands.compiler.compile(filename);
        respond(compiledPath);
        watcher?.add(filename);
      } catch (e) {
        log.error(`Error compiling file ${filename}, can't continue...`, e);
      }
    }
  );

  server.startListen();
  commands.addShutdownCleanup(() => server.stop());

  return server;
};

const childProcessArgs = () => {
  return [
    "-r",
    path.join(__dirname, "..", "dist-src", "child-process-registration.js"),
  ];
};

export const esbuildDev = async (options: Options) => {
  const workspaceRoot = findWorkspaceRoot(process.cwd()) || process.cwd();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev"));
  const syncSocketPath = path.join(workDir, "ipc.sock");

  const compiler = new Compiler(workspaceRoot, workDir);
  await compiler.boot();

  const supervisor = new Supervisor(
    [...childProcessArgs(), ...options.argv],
    syncSocketPath,
    options
  );

  const commands = new Commands(compiler, supervisor);

  let watcher: FSWatcher | undefined = undefined;
  if (options.reloadOnChanges)
    watcher = startFilesystemWatcher(workspaceRoot, commands);

  if (options.terminalCommands) startTerminalCommandListener(commands);

  startIPCServer(syncSocketPath, commands, watcher);

  // kickoff the first child process
  options.supervise &&
    log.info(
      `Supervision starting for command: node ${options.argv.join(" ")}`
    );

  await commands.invalidateBuildSetAndReload();

  process.on("SIGINT", () => {
    commands.shutdown(0);
  });

  if (!options.supervise) {
    supervisor.process.on("exit", (code) => commands.shutdown(code || 0));
  }
};
