import chokidar from "chokidar";
import findRoot from "find-root";
import findWorkspaceRoot from "find-yarn-workspace-root";
import fs from "fs-extra";
import { createRequire } from "node:module";
import os from "os";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Project } from "./Project.js";
import { Supervisor } from "./Supervisor.js";
import { MissingDestinationError, SwcCompiler } from "./SwcCompiler.js";
import { MiniServer } from "./mini-server.js";
import { log, projectConfig } from "./utils.js";
const dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
export const cli = async () => {
    const args = yargs(hideBin(process.argv))
        .parserConfiguration({
        "unknown-options-as-args": true,
    })
        .option("commands", {
        alias: "c",
        type: "boolean",
        description: "Trigger commands by watching for them on stdin. Prevents stdin from being forwarded to the process. Only command right now is `rs` to restart the server.",
        default: false,
    })
        .option("watch", {
        alias: "w",
        type: "boolean",
        description: "Trigger restarts by watching for changes to required files",
        default: false,
    }).argv;
    return await wds({
        argv: args._,
        terminalCommands: args.commands,
        reloadOnChanges: args.watch,
    });
};
const startTerminalCommandListener = (project) => {
    const reader = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    reader.on("line", (line) => {
        if (line.trim() === "rs") {
            log.info("Restart command received, restarting...");
            void project.invalidateBuildSetAndReload();
        }
    });
    project.addShutdownCleanup(() => reader.close());
    return reader;
};
const startFilesystemWatcher = (project) => {
    const watcher = chokidar.watch([], { ignoreInitial: true });
    project.supervisor.on("message", (value) => {
        if (value.require) {
            if (!value.require.includes("node_modules")) {
                watcher.add(value.require);
            }
        }
    });
    const reload = (path) => project.enqueueReload(path, false);
    const invalidateAndReload = (path) => project.enqueueReload(path, true);
    watcher.on("change", reload);
    watcher.on("add", invalidateAndReload);
    watcher.on("addDir", invalidateAndReload);
    watcher.on("unlink", invalidateAndReload);
    watcher.on("unlinkDir", invalidateAndReload);
    project.watcher = watcher;
    project.addShutdownCleanup(() => void watcher.close());
    return watcher;
};
const startIPCServer = async (socketPath, project) => {
    const compile = async (filename) => {
        try {
            await project.compiler.compile(filename);
            project.watcher?.add(filename);
            return await project.compiler.fileGroup(filename);
        }
        catch (error) {
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
    return [
        "--import",
        path.join(dirname, "hooks", "child-process-register.js"),
        "--require",
        require.resolve("@cspotcode/source-map-support/register"),
    ];
};
export const wds = async (options) => {
    const workspaceRoot = findWorkspaceRoot(process.cwd()) || process.cwd();
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wds"));
    log.debug(`starting wds for workspace root ${workspaceRoot} and workdir ${workDir}`);
    let serverSocketPath;
    if (os.platform() === "win32") {
        serverSocketPath = path.join("\\\\?\\pipe", workDir, "ipc.sock");
    }
    else {
        serverSocketPath = path.join(workDir, "ipc.sock");
    }
    const compiler = new SwcCompiler(workspaceRoot, workDir);
    const project = new Project(workspaceRoot, await projectConfig(findRoot(process.cwd())), compiler);
    project.supervisor = new Supervisor([...childProcessArgs(), ...options.argv], serverSocketPath, options, project);
    if (options.reloadOnChanges)
        startFilesystemWatcher(project);
    if (options.terminalCommands)
        startTerminalCommandListener(project);
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
    project.supervisor.process.on("exit", (code) => {
        const logShutdown = (explanation) => {
            log.debug(`child process exited with code ${code}, ${explanation}`);
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
//# sourceMappingURL=index.js.map