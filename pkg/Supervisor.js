import { spawn } from "child_process";
import { EventEmitter } from "events";
import { log } from "./utils.js";
/** */
export class Supervisor extends EventEmitter {
    constructor(argv, socketPath, options, project) {
        super();
        this.argv = argv;
        this.socketPath = socketPath;
        this.options = options;
        this.project = project;
    }
    /**
     * Stop the process with a given signal, then SIGKILL after a timeout
     * First signals only the ref'd process; once it exits, signal the rest of the process group.
     * Falls back to SIGKILL on the group if the ref'd process doesn't exit in time.
     * See https://azimi.me/2014/12/31/kill-child_process-node-js.html for more information
     */
    async stop(signal = "SIGTERM") {
        if (this.stopping) {
            return await this.stopping;
        }
        this.stopping = (async () => {
            // if we never started the child process, we don't need to do anything
            if (!this.process || !this.process.pid)
                return;
            // if the child process has already exited, we don't need to do anything
            if (this.process.exitCode !== null)
                return;
            // signal the child process and give if time to gracefully close, allow the child process
            // the chance to attempt a graceful shutdown of any child processes it may have spawned
            // once the child process exits, SIGKILL the rest of the process group that haven't exited yet
            // if the child process doesn't exit in time, SIGKILL the whole process group
            const ref = this.process;
            const refPid = ref.pid;
            log.debug(`stopping process ${refPid} with signal ${signal}`);
            this.kill(signal, refPid, false);
            const exited = await Promise.race([
                new Promise((resolve) => ref.once("exit", () => resolve(true))),
                new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
            ]);
            if (exited) {
                log.debug(`process ${refPid} exited successfully, killing process group`);
            }
            else {
                log.debug(`process ${refPid} did not exit in time, killing process group`);
            }
            this.kill("SIGKILL", refPid, true);
        })();
        return await this.stopping;
    }
    restart() {
        if (this.process?.pid) {
            log.debug(`restarting process group ${this.process.pid} with SIGKILL`);
            this.kill();
        }
        const stdio = [null, "inherit", "inherit"];
        if (!this.options.terminalCommands) {
            stdio[0] = "inherit";
        }
        if (process.send) {
            // WDS was called from a process that has IPC
            stdio.push("ipc");
        }
        this.process = spawn("node", this.argv, {
            cwd: process.cwd(),
            env: {
                ...process.env,
                WDS_SOCKET_PATH: this.socketPath,
                WDS_EXTENSIONS: this.project.config.extensions.join(","),
                WDS_ESM_ENABLED: this.project.config.esm ? "true" : "false",
            },
            stdio: stdio,
            detached: true,
        });
        if (this.options.terminalCommands) {
            this.process.stdin.end();
        }
        const onChildProcessMessage = (message) => {
            if (process.send) {
                try {
                    process.send(message);
                }
                catch (error) {
                    log.warn(`WDS error: error sending message to parent process: ${error.message}`);
                }
            }
        };
        const onParentProcessMessage = (message) => {
            try {
                this.process.send(message);
            }
            catch (error) {
                log.warn(`WDS error: error sending message to child process: ${error.message}`);
            }
        };
        process.on("message", onParentProcessMessage);
        this.process.on("message", onChildProcessMessage);
        this.process.on("exit", (code, signal) => {
            if (signal !== "SIGKILL") {
                let message = `process exited with code ${code}`;
                if (signal)
                    message += ` with signal ${signal}`;
                log.warn(message);
            }
            this.process.off("message", onChildProcessMessage);
            process.off("message", onParentProcessMessage);
        });
        return this.process;
    }
    kill(signal = "SIGKILL", pid = this.process?.pid, group = true) {
        if (!pid)
            return;
        if (group) {
            log.debug(`killing process group ${pid} with signal ${signal}`);
        }
        else {
            log.debug(`killing process ${pid} with signal ${signal}`);
        }
        try {
            if (group) {
                process.kill(-pid, signal);
            }
            else {
                process.kill(pid, signal);
            }
        }
        catch (error) {
            log.debug(`error killing process ${pid} with signal ${signal}: ${error.message}`);
            if (error.code !== "ESRCH" && error.code !== "EPERM")
                throw error;
        }
    }
}
//# sourceMappingURL=Supervisor.js.map