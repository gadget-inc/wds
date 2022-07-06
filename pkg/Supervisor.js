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
        const stdio = [null, "inherit", "inherit"];
        if (process.send) {
            // WDS was called from a process that has IPC
            stdio.push("ipc");
        }
        this.process = child_process_1.spawn("node", this.argv, {
            cwd: process.cwd(),
            env: {
                ...process.env,
                WDS_SOCKET_PATH: this.socketPath,
                WDS_EXTENSIONS: this.project.config.extensions.join(","),
            },
            stdio: stdio,
        });
        const onChildProcessMessage = (message) => {
            if (process.send)
                process.send(message);
        };
        const onParentProcessMessage = (message) => {
            this.process.send(message);
        };
        process.on("message", onParentProcessMessage);
        this.process.on("message", onChildProcessMessage);
        this.process.on("exit", (code, signal) => {
            if (signal !== "SIGKILL" && this.options.supervise) {
                utils_1.log.warn(`process exited with ${code}`);
            }
            this.process.off("message", onChildProcessMessage);
            process.off("message", onParentProcessMessage);
        });
        return this.process;
    }
}
exports.Supervisor = Supervisor;
//# sourceMappingURL=Supervisor.js.map