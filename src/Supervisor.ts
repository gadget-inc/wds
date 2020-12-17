import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import { log } from "./utils";

/** */
export class Supervisor extends EventEmitter {
  process!: ChildProcess;
  constructor(readonly argv: string[], readonly socketPath: string) {
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

    this.process = spawn("node", this.argv, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ESBUILD_DEV_SOCKET_PATH: this.socketPath,
      },
      stdio: [null, "inherit", "inherit", "ipc"],
    });

    this.process.on("message", (value) => this.emit("message", value));
    this.process.on("exit", (code, signal) => {
      if (signal !== "SIGKILL") {
        log.warn(`process exited with ${code}`);
      }
    });
  }
}
