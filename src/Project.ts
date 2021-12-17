import { FSWatcher } from "chokidar";
import { compact, debounce } from "lodash";
import { ProjectConfig } from "./Options";
import { Supervisor } from "./Supervisor";
import { SwcCompiler } from "./SwcCompiler";
import { log } from "./utils";

interface ReloadBatch {
  paths: string[];
  invalidate: boolean;
}

/** Orchestrates all the other bits to respond to high level commands */
export class Project {
  cleanups: (() => void)[] = [];
  currentBatch: ReloadBatch = { paths: [], invalidate: false };
  compiler!: SwcCompiler;
  supervisor!: Supervisor;
  watcher?: FSWatcher;

  constructor(readonly workspaceRoot: string, readonly config: ProjectConfig) {}

  addShutdownCleanup(cleanup: () => void) {
    this.cleanups.push(cleanup);
  }

  enqueueReload(path: string, requiresInvalidation = false) {
    // TODO: Since we're not awaiting on the `compiler.compile`,
    //  this creates a race condition where the `node` process could be reloaded
    //  before the file has compiled. In practice, the file compiles orders of magnitude faster.
    //  Nonetheless this should be addressed before releasing.
    void this.compiler.compile(path);
    this.currentBatch.paths.push(path);
    this.currentBatch.invalidate = this.currentBatch.invalidate || requiresInvalidation;
    this.debouncedReload();
  }

  debouncedReload = debounce(() => {
    void this.reloadNow();
  }, 15);

  async reloadNow() {
    log.info(
      compact([
        this.currentBatch.paths[0].replace(this.workspaceRoot, ""),
        this.currentBatch.paths.length > 1 && ` and ${this.currentBatch.paths.length - 1} others`,
        " changed, ",
        this.currentBatch.invalidate && "reinitializing and ",
        "restarting ...",
      ]).join("")
    );
    const invalidate = this.currentBatch.invalidate;
    this.currentBatch = { paths: [], invalidate: false };
    if (invalidate) {
      await this.compiler.invalidateBuildSet();
    }
    this.supervisor.restart();
  }

  async invalidateBuildSetAndReload() {
    await this.compiler.invalidateBuildSet();
    this.supervisor.restart();
  }

  shutdown(code = 0) {
    this.supervisor.stop();
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    process.exit(code);
  }
}
