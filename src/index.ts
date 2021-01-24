import { FSWatcher, watch } from "chokidar";
import findWorkspaceRoot from "find-yarn-workspace-root";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Commands } from "./Commands";
import { Compiler } from "./Compiler";
import { MiniServer } from "./mini-server";
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
      description: "Supervise and restart the process when it exits indefinitely",
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

const startFilesystemWatcher = (commands: Commands) => {
  const watcher = watch([], { ignoreInitial: true });

  commands.supervisor.on("message", (value) => {
    if (value.require) {
      if (!value.require.includes("node_modules")) {
        watcher.add(value.require);
      }
    }
  });

  const reload = (path: string) => commands.enqueueReload(path, false);
  const invalidateAndReload = (path: string) => commands.enqueueReload(path, true);

  watcher.on("change", reload);
  watcher.on("add", invalidateAndReload);
  watcher.on("addDir", invalidateAndReload);
  watcher.on("unlink", invalidateAndReload);
  watcher.on("unlinkDir", invalidateAndReload);

  commands.addShutdownCleanup(() => void watcher.close());

  return watcher;
};

const startIPCServer = async (socketPath: string, commands: Commands, watcher?: FSWatcher) => {
  const compile = async (filename: string) => {
    try {
      await commands.compiler.compile(filename);
      watcher?.add(filename);
      return commands.compiler.fileGroup(filename);
    } catch (e) {
      log.error(`Error compiling file ${filename}, can't continue...`, e);
    }
  };

  const server = new MiniServer({
    "/compile": async (request, reply) => {
      const results = await compile(request.body);
      reply.json({ filenames: results });
    },
    "/file-required": (request, reply) => {
      for (const filename of request.json()) {
        watcher?.add(filename);
      }
      reply.json({ status: "ok" });
    },
  });
  await server.start(socketPath);

  commands.addShutdownCleanup(() => server.close());

  return server;
};

const childProcessArgs = () => {
  return ["-r", path.join(__dirname, "child-process-registration.js")];
};

export const esbuildDev = async (options: Options) => {
  const workspaceRoot = findWorkspaceRoot(process.cwd()) || process.cwd();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev"));
  let syncSocketPath: string;
  if (os.platform() === "win32") {
    syncSocketPath = path.join("\\\\?\\pipe", workDir, "ipc.sock");
  } else {
    syncSocketPath = path.join(workDir, "ipc.sock");
  }

  const compiler = new Compiler(workspaceRoot, workDir);
  await compiler.boot();

  const supervisor = new Supervisor([...childProcessArgs(), ...options.argv], syncSocketPath, options);

  const commands = new Commands(workspaceRoot, compiler, supervisor);

  let watcher: FSWatcher | undefined = undefined;
  if (options.reloadOnChanges) watcher = startFilesystemWatcher(commands);
  if (options.terminalCommands) startTerminalCommandListener(commands);

  await startIPCServer(syncSocketPath, commands, watcher);

  // kickoff the first child process
  options.supervise && log.info(`Supervision starting for command: node ${options.argv.join(" ")}`);

  await commands.invalidateBuildSetAndReload();

  process.on("SIGINT", () => {
    commands.shutdown(0);
  });

  if (!options.supervise) {
    supervisor.process.on("exit", (code) => commands.shutdown(code || 0));
  }
};
