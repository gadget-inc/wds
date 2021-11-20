"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Project = void 0;
const lodash_1 = require("lodash");
const utils_1 = require("./utils");
/** Orchestrates all the other bits to respond to high level commands */
class Project {
    constructor(workspaceRoot, config) {
        this.workspaceRoot = workspaceRoot;
        this.config = config;
        this.cleanups = [];
        this.currentBatch = { paths: [], invalidate: false };
        this.debouncedReload = lodash_1.debounce(() => {
            void this.reloadNow();
        }, 15);
    }
    addShutdownCleanup(cleanup) {
        this.cleanups.push(cleanup);
    }
    enqueueReload(path, requiresInvalidation = false) {
        this.currentBatch.paths.push(path);
        this.currentBatch.invalidate = this.currentBatch.invalidate || requiresInvalidation;
        this.debouncedReload();
    }
    async reloadNow() {
        utils_1.log.info(lodash_1.compact([
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
        await this.compiler.rebuild();
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
exports.Project = Project;
//# sourceMappingURL=Project.js.map