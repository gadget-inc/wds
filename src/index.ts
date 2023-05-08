import { watch } from "chokidar";
import findRoot from "find-root";
import findWorkspaceRoot from "find-yarn-workspace-root";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { RunOptions } from "./Options";
import { Project } from "./Project";
import { Supervisor } from "./Supervisor";
import { SwcCompiler } from "./SwcCompiler";
import { MiniServer } from "./mini-server";
import { log, projectConfig } from "./utils";

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
      default: false,
    }).argv;

  return await wds({
    argv: args._ as any,
    terminalCommands: args.commands,
    reloadOnChanges: args.watch,
  });
};

const startTerminalCommandListener = (project: Project) => {
  const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  reader.on("line", (line: string) => {
    if (line.trim() === "rs") {
      log.info("Restart command received, restarting...");
      void project.invalidateBuildSetAndReload();
    }
  });

  project.addShutdownCleanup(() => reader.close());

  return reader;
};

const startFilesystemWatcher = (project: Project) => {
  const watcher = watch([], { ignoreInitial: true });

  project.supervisor.on("message", (value) => {
    if (value.require) {
      if (!value.require.includes("node_modules")) {
        watcher.add(value.require);
      }
    }
  });

  const reload = (path: string) => project.enqueueReload(path, false);
  const invalidateAndReload = (path: string) => project.enqueueReload(path, true);

  watcher.on("change", reload);
  watcher.on("add", invalidateAndReload);
  watcher.on("addDir", invalidateAndReload);
  watcher.on("unlink", invalidateAndReload);
  watcher.on("unlinkDir", invalidateAndReload);

  project.watcher = watcher;
  project.addShutdownCleanup(() => void watcher.close());

  return watcher;
};

const startIPCServer = async (socketPath: string, project: Project) => {
  const compile = async (filename: string) => {
    try {
      await project.compiler.compile(filename);
      project.watcher?.add(filename);
      return await project.compiler.fileGroup(filename);
    } catch (error) {
      log.error(`Error compiling file ${filename}:`, error);
    }
  };

  const server = new MiniServer({
    "/compile": async (request, reply) => {
      const results = await compile(request.body);
      reply.json({ filenames: results });
    },
    "/file-required": (request, reply) => {
      for (const filename of request.json()) {
        project.watcher?.add(filename);
      }
      reply.json({ status: "ok" });
    },
  });

  log.debug(`Starting supervisor server at ${socketPath}`);
  await server.start(socketPath);

  project.addShutdownCleanup(() => server.close());

  return server;
};

const childProcessArgs = () => {
  return ["-r", path.join(__dirname, "child-process-registration.js"), "-r", require.resolve("@cspotcode/source-map-support/register")];
};

export const wds = async (options: RunOptions) => {
  const workspaceRoot = findWorkspaceRoot(process.cwd()) || process.cwd();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wds"));
  log.debug(`starting wds for workspace root ${workspaceRoot} and workdir ${workDir}`);

  let serverSocketPath: string;
  if (os.platform() === "win32") {
    serverSocketPath = path.join("\\\\?\\pipe", workDir, "ipc.sock");
  } else {
    serverSocketPath = path.join(workDir, "ipc.sock");
  }

  const compiler = new SwcCompiler(workspaceRoot, workDir);

  const project = new Project(workspaceRoot, await projectConfig(findRoot(process.cwd())), compiler);
  project.supervisor = new Supervisor([...childProcessArgs(), ...options.argv], serverSocketPath, options, project);

  if (options.reloadOnChanges) startFilesystemWatcher(project);
  if (options.terminalCommands) startTerminalCommandListener(project);
  await startIPCServer(serverSocketPath, project);

  // kickoff the first child process
  options.reloadOnChanges && log.info(`Supervision starting for command: node ${options.argv.join(" ")}`);
  await project.invalidateBuildSetAndReload();

  process.on("SIGINT", () => {
    log.debug(`process ${process.pid} got SIGINT`);
    project.shutdown(0);
  });
  process.on("SIGTERM", () => {
    log.debug(`process ${process.pid} got SIGTERM`);
    project.shutdown(0);
  });

  project.supervisor.process.on("exit", (code) => {
    const logShutdown = (explanation: string) => {
      log.debug(`child process exited with code ${code}, ${explanation}`);
    };
    if (options.reloadOnChanges) {
      logShutdown("not exiting because we're on 'watch' mode");
      return;
    }
    logShutdown("shutting down project since it's no longer needed...");
    project.shutdown(code ?? 1);
  });
};
