"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wds = exports.cli = void 0;
const chokidar_1 = require("chokidar");
const find_root_1 = __importDefault(require("find-root"));
const find_yarn_workspace_root_1 = __importDefault(require("find-yarn-workspace-root"));
const graceful_fs_1 = require("graceful-fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const Project_1 = require("./Project");
const Supervisor_1 = require("./Supervisor");
const SwcCompiler_1 = require("./SwcCompiler");
const mini_server_1 = require("./mini-server");
const utils_1 = require("./utils");
const cli = async () => {
    const args = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
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
    return await (0, exports.wds)({
        argv: args._,
        terminalCommands: args.commands,
        reloadOnChanges: args.watch,
    });
};
exports.cli = cli;
const startTerminalCommandListener = (project) => {
    const reader = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    reader.on("line", (line) => {
        if (line.trim() === "rs") {
            utils_1.log.info("Restart command received, restarting...");
            void project.invalidateBuildSetAndReload();
        }
    });
    project.addShutdownCleanup(() => reader.close());
    return reader;
};
const startFilesystemWatcher = (project) => {
    const watcher = (0, chokidar_1.watch)([], { ignoreInitial: true });
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
            utils_1.log.error(`Error compiling file ${filename}:`, error);
            if (error instanceof SwcCompiler_1.MissingDestinationError && error.ignoredFile) {
                return {
                    [filename]: {
                        ignored: true,
                    },
                };
            }
        }
    };
    const server = new mini_server_1.MiniServer({
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
    utils_1.log.debug(`Starting supervisor server at ${socketPath}`);
    await server.start(socketPath);
    project.addShutdownCleanup(() => server.close());
    return server;
};
const childProcessArgs = () => {
    return ["-r", path_1.default.join(__dirname, "child-process-registration.js"), "-r", require.resolve("@cspotcode/source-map-support/register")];
};
const wds = async (options) => {
    const workspaceRoot = (0, find_yarn_workspace_root_1.default)(process.cwd()) || process.cwd();
    const workDir = await graceful_fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "wds"));
    utils_1.log.debug(`starting wds for workspace root ${workspaceRoot} and workdir ${workDir}`);
    let serverSocketPath;
    if (os_1.default.platform() === "win32") {
        serverSocketPath = path_1.default.join("\\\\?\\pipe", workDir, "ipc.sock");
    }
    else {
        serverSocketPath = path_1.default.join(workDir, "ipc.sock");
    }
    const compiler = new SwcCompiler_1.SwcCompiler(workspaceRoot, workDir);
    const project = new Project_1.Project(workspaceRoot, await (0, utils_1.projectConfig)((0, find_root_1.default)(process.cwd())), compiler);
    project.supervisor = new Supervisor_1.Supervisor([...childProcessArgs(), ...options.argv], serverSocketPath, options, project);
    if (options.reloadOnChanges)
        startFilesystemWatcher(project);
    if (options.terminalCommands)
        startTerminalCommandListener(project);
    const server = await startIPCServer(serverSocketPath, project);
    // kickoff the first child process
    options.reloadOnChanges && utils_1.log.info(`Supervision starting for command: node ${options.argv.join(" ")}`);
    await project.invalidateBuildSetAndReload();
    process.on("SIGINT", () => {
        utils_1.log.debug(`process ${process.pid} got SIGINT`);
        void project.shutdown(0);
    });
    process.on("SIGTERM", () => {
        utils_1.log.debug(`process ${process.pid} got SIGTERM`);
        void project.shutdown(0);
    });
    project.supervisor.process.on("exit", (code) => {
        const logShutdown = (explanation) => {
            utils_1.log.debug(`child process exited with code ${code}, ${explanation}`);
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
exports.wds = wds;
//# sourceMappingURL=index.js.map