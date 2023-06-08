"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Supervisor = void 0;
const promises_1 = require("timers/promises");
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
    /**
     * Stop the process with a graceful SIGTERM, then SIGKILL after a timeout
     * Kills the whole process group so that any subprocesses of the process are also killed
     * See https://azimi.me/2014/12/31/kill-child_process-node-js.html for more information
     */
    async stop() {
        if (!this.process || !this.process.pid)
            return;
        const ref = this.process;
        const exit = (0, events_1.once)(ref, 'exit');
        this.kill("SIGTERM");
        await Promise.race([exit, (0, promises_1.setTimeout)(3000)]);
        if (!ref.killed) {
            this.kill("SIGKILL", ref.pid);
        }
    }
    kill(signal = "SIGKILL", pid = this.process?.pid) {
        if (pid) {
            try {
                process.kill(-pid, signal);
            }
            catch (error) {
                if (error.code == "ESRCH") {
                    // process can't be found, is already dead
                    return;
                }
                else {
                    throw error;
                }
            }
        }
    }
    restart() {
        this.kill();
        const stdio = [null, "inherit", "inherit"];
        if (!this.options.terminalCommands) {
            stdio[0] = "inherit";
        }
        if (process.send) {
            // WDS was called from a process that has IPC
            stdio.push("ipc");
        }
        this.process = (0, child_process_1.spawn)("node", this.argv, {
            cwd: process.cwd(),
            env: {
                ...process.env,
                WDS_SOCKET_PATH: this.socketPath,
                WDS_EXTENSIONS: this.project.config.extensions.join(","),
            },
            stdio: stdio,
            detached: true
        });
        if (this.options.terminalCommands) {
            this.process.stdin.end();
        }
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
            if (signal !== "SIGKILL") {
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