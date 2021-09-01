"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Supervisor = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const utils_1 = require("./utils");
/** */
class Supervisor extends events_1.EventEmitter {
    constructor(argv, socketPath, options, project) {
        super();
        this.argv = argv;
        this.socketPath = socketPath;
        this.options = options;
        this.project = project;
    }
    stop() {
        if (this.process) {
            this.process.kill("SIGTERM");
        }
        const process = this.process;
        setTimeout(() => {
            if (!process.killed) {
                process.kill("SIGKILL");
            }
        }, 5000);
    }
    kill() {
        if (this.process) {
            this.process.kill("SIGKILL");
        }
    }
    restart() {
        if (this.process) {
            this.process.kill("SIGKILL");
        }
        this.process = child_process_1.spawn("node", this.argv, {
            cwd: process.cwd(),
            env: {
                ...process.env,
                ESBUILD_DEV_SOCKET_PATH: this.socketPath,
                ESBUILD_DEV_EXTENSIONS: this.project.config.extensions.join(","),
            },
            stdio: [null, "inherit", "inherit", "ipc"],
        });
        this.process.on("message", (value) => this.emit("message", value));
        this.process.on("exit", (code, signal) => {
            if (signal !== "SIGKILL" && this.options.supervise) {
                utils_1.log.warn(`process exited with ${code}`);
            }
        });
        return this.process;
    }
}
exports.Supervisor = Supervisor;
//# sourceMappingURL=Supervisor.js.map