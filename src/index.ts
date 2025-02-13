import { findWorkspaceDir as findPnpmWorkspaceRoot } from "@pnpm/find-workspace-dir";
import findRoot from "find-root";
import findYarnWorkspaceRoot from "find-yarn-workspace-root";
import fs from "fs-extra";
import os from "os";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import Watcher from "watcher";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Project } from "./Project.js";
import { projectConfig, type ProjectConfig, type RunOptions } from "./ProjectConfig.js";
import { Supervisor } from "./Supervisor.js";
import { MissingDestinationError, SwcCompiler } from "./SwcCompiler.js";
import { MiniServer } from "./mini-server.js";
import { log } from "./utils.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));

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

const gitDir = `${path.sep}.git${path.sep}`;
const nodeModulesDir = `${path.sep}node_modules${path.sep}`;

const startFilesystemWatcher = (project: Project) => {
  const watcher = new Watcher([project.workspaceRoot], {
    ignoreInitial: true,
    recursive: true,
    ignore: (filePath: string) => {
      if (filePath.includes(nodeModulesDir)) return true;
      if (filePath == project.workspaceRoot) return false;
      if (filePath == project.config.root) return false;
      if (filePath.endsWith(".d.ts")) return true;
      if (filePath.endsWith(".map")) return true;
      if (filePath.includes(gitDir)) return true;
      if (filePath.endsWith(".DS_Store")) return true;
      if (filePath.endsWith(".tsbuildinfo")) return true;

      // allow files that match the include glob to be watched, or directories (since they might contain files)
      return !project.config.includedMatcher(filePath) && path.extname(filePath) != "";
    },
  });

  log.debug("started watcher", { root: project.workspaceRoot });

  project.supervisor.on("message", (value) => {
    if (value.require) {
      if (!value.require.includes("node_modules")) {
        project.watchFile(value.require);
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

  project.addShutdownCleanup(() => void watcher.close());

  return watcher;
};

const startIPCServer = async (socketPath: string, project: Project) => {
  const compile = async (filename: string) => {
    try {
      await project.compiler.compile(filename);
      project.watched.insert(filename);
      return await project.compiler.fileGroup(filename);
    } catch (error) {
      log.error(`Error compiling file ${filename}:`, error);

      if (error instanceof MissingDestinationError && error.ignoredFile) {
        return {
          [filename]: {
            ignored: true,
          },
        };
      }
    }
  };

  const server = new MiniServer({
    "/compile": async (request, reply) => {
      const results = await compile(request.body);
      reply.json({ filenames: results });
    },
    "/file-required": (request, reply) => {
      for (const filename of request.json()) {
        project.watchFile(filename);
      }
      reply.json({ status: "ok" });
    },
  });

  log.debug(`Starting supervisor server at ${socketPath}`);
  await server.start(socketPath);

  project.addShutdownCleanup(() => server.close());

  return server;
};

const childProcessArgs = (config: ProjectConfig) => {
  const args = ["--require", path.join(dirname, "hooks", "child-process-cjs-hook.cjs")];
  if (config.esm) {
    args.push("--import", path.join(dirname, "hooks", "child-process-esm-hook.js"));
  }
  return args;
};

export const wds = async (options: RunOptions) => {
  let workspaceRoot: string;
  let projectRoot: string;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wds"));

  const firstNonOptionArg = options.argv.find((arg) => !arg.startsWith("-"));
  if (firstNonOptionArg && fs.existsSync(firstNonOptionArg)) {
    const absolutePath = path.resolve(firstNonOptionArg);
    projectRoot = findRoot(path.dirname(absolutePath));
    workspaceRoot = (await findPnpmWorkspaceRoot(projectRoot)) || findYarnWorkspaceRoot(projectRoot) || projectRoot;
  } else {
    projectRoot = findRoot(process.cwd());
    workspaceRoot = (await findPnpmWorkspaceRoot(process.cwd())) || findYarnWorkspaceRoot(process.cwd()) || process.cwd();
  }

  let serverSocketPath: string;
  if (os.platform() === "win32") {
    serverSocketPath = path.join("\\\\?\\pipe", workDir, "ipc.sock");
  } else {
    serverSocketPath = path.join(workDir, "ipc.sock");
  }

  const config = await projectConfig(projectRoot);
  log.debug(`starting wds for workspace root ${workspaceRoot} and workdir ${workDir}`, config);

  const compiler = await SwcCompiler.create(workspaceRoot, config.cacheDir);
  const project = new Project(workspaceRoot, config, compiler);

  project.supervisor = new Supervisor([...childProcessArgs(config), ...options.argv], serverSocketPath, options, project);

  if (options.reloadOnChanges) startFilesystemWatcher(project);
  if (options.terminalCommands) startTerminalCommandListener(project);
  const server = await startIPCServer(serverSocketPath, project);

  // kickoff the first child process
  options.reloadOnChanges && log.info(`Supervision starting for command: node ${options.argv.join(" ")}`);
  await project.invalidateBuildSetAndReload();

  process.on("SIGINT", () => {
    log.debug(`process ${process.pid} got SIGINT`);
    void project.shutdown(0);
  });
  process.on("SIGTERM", () => {
    log.debug(`process ${process.pid} got SIGTERM`);
    void project.shutdown(0);
  });

  project.supervisor.process.on("exit", (code, signal) => {
    const logShutdown = (explanation: string) => {
      log.debug(`child process exited with code=${code} signal=${signal}, ${explanation}`);
    };
    if (options.reloadOnChanges) {
      logShutdown("not exiting because we're on 'watch' mode");
      return;
    }
    logShutdown("shutting down project since it's no longer needed...");
    void project.shutdown(code ?? 1);
  });

  return server;
};
