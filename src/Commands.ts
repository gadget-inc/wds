import { compact, debounce } from "lodash";
import { Compiler } from "./Compiler";
import { Supervisor } from "./Supervisor";
import { log } from "./utils";

interface ReloadBatch {
  paths: string[];
  invalidate: boolean;
}

/** Orchestrates all the other bits to respond to high level commands */
export class Commands {
  cleanups: (() => void)[] = [];
  currentBatch: ReloadBatch = { paths: [], invalidate: false };

  constructor(readonly workspaceRoot: string, readonly compiler: Compiler, readonly supervisor: Supervisor) {}

  addShutdownCleanup(cleanup: () => void) {
    this.cleanups.push(cleanup);
  }

  enqueueReload(path: string, requiresInvalidation = false) {
    this.currentBatch.paths.push(path);
    this.currentBatch.invalidate = this.currentBatch.invalidate || requiresInvalidation;
    this.debouncedReload();
  }

  debouncedReload = debounce(() => {
    void this.reloadNow();
  }, 15);

  async reloadNow() {
    const message = compact([
      this.currentBatch.paths[0].replace(this.workspaceRoot, ""),
      this.currentBatch.paths.length > 1 && ` and ${this.currentBatch.paths.length - 1} others`,
      " changed, ",
      this.currentBatch.invalidate && "reinitializing and ",
      "restarting ...",
    ]);

    log.info(message.join(""));
    const invalidate = this.currentBatch.invalidate;
    this.currentBatch = { paths: [], invalidate: false };
    if (invalidate) {
      await this.compiler.invalidateBuildSet();
    }
    await this.compiler.rebuild();
    this.supervisor.restart();
  }

  async invalidateBuildSetAndReload() {
    await this.compiler.invalidateBuildSet();
    await this.compiler.rebuild();
    this.supervisor.restart();
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
