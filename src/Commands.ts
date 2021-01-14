import { Compiler } from "./Compiler";
import { Supervisor } from "./Supervisor";

/** Orchestrates all the other bits to respond to high level commands */
export class Commands {
  cleanups: (() => void)[] = [];

  constructor(readonly compiler: Compiler, readonly supervisor: Supervisor) {}

  addShutdownCleanup(cleanup: () => void) {
    this.cleanups.push(cleanup);
  }

  async reload() {
    await this.compiler.rebuild();
    this.supervisor.restart();
  }

  async invalidateBuildSetAndReload() {
    await this.compiler.invalidateBuildSet();
    await this.reload();
  }

  shutdown(code = 0) {
    this.supervisor.stop();
    this.compiler.stop();
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    process.exit(code);
  }
}
