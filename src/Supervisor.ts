import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import { RunOptions } from "./Options";
import { Project } from "./Project";
import { log } from "./utils";

/** */
export class Supervisor extends EventEmitter {
  process!: ChildProcess;
  constructor(readonly argv: string[], readonly socketPath: string, readonly options: RunOptions, readonly project: Project) {
    super();
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

    const stdio: Array<null | "inherit" | "ipc"> = [null, "inherit", "inherit"];
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
      },
      stdio: stdio,
    });

    const onChildProcessMessage = (message: any) => {
      if (process.send) process.send(message);
    };
    const onParentProcessMessage = (message: any) => {
      this.process.send(message);
    };
    process.on("message", onParentProcessMessage);
    this.process.on("message", onChildProcessMessage);
    this.process.on("exit", (code, signal) => {
      if (signal !== "SIGKILL" && this.options.supervise) {
        log.warn(`process exited with ${code}`);
      }
      this.process.off("message", onChildProcessMessage);
      process.off("message", onParentProcessMessage);
    });

    return this.process;
  }
}
