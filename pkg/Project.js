import _ from "lodash";
import { PathTrie } from "./PathTrie.js";
import { log } from "./utils.js";
/** Orchestrates all the other bits to respond to high level commands */
export class Project {
    constructor(workspaceRoot, config, compiler) {
        this.workspaceRoot = workspaceRoot;
        this.config = config;
        this.compiler = compiler;
        this.cleanups = [];
        this.currentBatch = { paths: [], invalidate: false };
        this.watched = new PathTrie();
        this.debouncedReload = _.debounce(() => {
            void this.reloadNow();
        }, 15);
    }
    addShutdownCleanup(cleanup) {
        this.cleanups.push(cleanup);
    }
    enqueueReload(path, requiresInvalidation = false) {
        log.debug({ path }, "watch event");
        if (this.watched.contains(path)) {
            this.compiler.invalidate(path);
            this.currentBatch.paths.push(path);
            this.currentBatch.invalidate = this.currentBatch.invalidate || requiresInvalidation;
            this.debouncedReload();
        }
    }
    async reloadNow() {
        log.info(_.compact([
            this.currentBatch.paths[0].replace(this.workspaceRoot, ""),
            this.currentBatch.paths.length > 1 && ` and ${this.currentBatch.paths.length - 1} others`,
            " changed, ",
            this.currentBatch.invalidate && "reinitializing and ",
            "restarting ...",
        ]).join(""));
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
        this.supervisor.restart();
    }
    async shutdown(code = 0) {
        await this.supervisor.stop();
        for (const cleanup of this.cleanups) {
            cleanup();
        }
        process.exit(code);
    }
    watchFile(path) {
        this.watched.insert(path);
    }
}
//# sourceMappingURL=Project.js.map