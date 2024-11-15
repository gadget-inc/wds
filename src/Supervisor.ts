import type { ChildProcess, StdioOptions } from "child_process";
import { spawn } from "child_process";
import { EventEmitter, once } from "events";
import { setTimeout } from "timers/promises";
import type { RunOptions } from "./Options.js";
import type { Project } from "./Project.js";
import { log } from "./utils.js";

/** */
export class Supervisor extends EventEmitter {
  process!: ChildProcess;
  constructor(readonly argv: string[], readonly socketPath: string, readonly options: RunOptions, readonly project: Project) {
    super();
  }

  /**
   * Stop the process with a graceful SIGTERM, then SIGKILL after a timeout
   * Kills the whole process group so that any subprocesses of the process are also killed
   * See https://azimi.me/2014/12/31/kill-child_process-node-js.html for more information
   */
  async stop() {
    // if we never started the child process, we don't need to do anything
    if (!this.process || !this.process.pid) return;

    // if the child process has already exited, we don't need to do anything
    if (this.process.exitCode !== null) return;

    const ref = this.process;
    const exit = once(ref, "exit");
    this.kill("SIGTERM");

    await Promise.race([exit, setTimeout(5000)]);
    if (!ref.killed) {
      this.kill("SIGKILL", ref.pid);
    }
  }

  kill(signal = "SIGKILL", pid = this.process?.pid) {
    if (pid) {
      try {
        process.kill(-pid, signal);
      } catch (error: any) {
        if (error.code == "ESRCH" || error.code == "EPERM") {
          // process can't be found or can't be killed again, its already dead
        } else {
          throw error;
        }
      }
    }
  }

  restart() {
    this.kill();

    const stdio: StdioOptions = [null, "inherit", "inherit"];
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
      this.process.stdin!.end();
    }

    const onChildProcessMessage = (message: any) => {
      if (process.send) process.send(message);
    };
    const onParentProcessMessage = (message: any) => {
      this.process.send(message);
    };
    process.on("message", onParentProcessMessage);
    this.process.on("message", onChildProcessMessage);
    this.process.on("exit", (code, signal) => {
      if (signal !== "SIGKILL") {
        log.warn(`process exited with ${code}`);
      }
      this.process.off("message", onChildProcessMessage);
      process.off("message", onParentProcessMessage);
    });

    return this.process;
  }
}
