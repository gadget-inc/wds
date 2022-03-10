"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsBuildCompiler = void 0;
const esbuild = __importStar(require("esbuild"));
const find_root_1 = __importDefault(require("find-root"));
const globby_1 = __importDefault(require("globby"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];
/** Implements TypeScript building using esbuild */
class EsBuildCompiler {
    constructor(workspaceRoot, workDir) {
        this.workspaceRoot = workspaceRoot;
        this.workDir = workDir;
        // a list of incremental esbuilds we're maintaining right now, one for each tsconfig.json / typescript project required by the process
        this.builds = [];
        // a map from filename to which build is responsible for it
        this.fileToBuildMap = {};
        // a map from a tsconfig file to which build is responsible for it
        this.rootToBuildMap = {};
        // a map from filename to which group of files are being built alongside it
        this.fileToGroupMap = {};
        // a map from absolute input filename to absolute output filename
        this.fileToDestinationMap = {};
    }
    /**
     * When a file operation occurs that requires setting up all the esbuild builds again, we run this.
     * The operations that should cause an invalidation are:
     *  - a change in the tsconfig.json
     *  - any new file being added
     *  - any existing file being deleted
     *
     * The set of files being built changing causes a reset because esbuild is only incremental over the exact same set of input options passed to it, which includes the files. So we need
     */
    async invalidateBuildSet() {
        await Promise.all(this.builds.map((build) => build.rebuild.dispose()));
        this.builds = [];
        this.fileToBuildMap = {};
        this.rootToBuildMap = {};
    }
    /**
     * Start compiling a new file at `filename`.
     **/
    async compile(filename) {
        await this.startBuilding(filename);
        await this.destination(filename);
        return;
    }
    /**
     * For a given input filename, return all the destinations of the files compiled alongside it in it's compilation group
     **/
    async fileGroup(filename) {
        const files = this.fileToGroupMap[filename];
        const result = {};
        if (!files)
            return result;
        for (const file of files) {
            result[file] = await this.destination(file);
        }
        return result;
    }
    async rebuild() {
        const duration = await utils_1.time(async () => {
            await Promise.all(this.builds.map((build) => this.reportESBuildErrors(() => build.rebuild())));
        });
        utils_1.log.debug("rebuild", {
            duration,
        });
    }
    async getModule(filename) {
        const root = find_root_1.default(filename);
        const config = await utils_1.projectConfig(root);
        const globs = [...this.fileGlobPatterns(config), ...this.ignoreFileGlobPatterns(config)];
        utils_1.log.debug("searching for filenames", { config, root, globs });
        let fileNames = await globby_1.default(globs, { cwd: root, absolute: true });
        if (process.platform === "win32") {
            fileNames = fileNames.map((fileName) => fileName.replace(/\//g, "\\"));
        }
        return { root, fileNames, config };
    }
    /**
     * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
     * If a file is part of a project we've seen before, it's a no-op.
     **/
    async startBuilding(filename) {
        if (this.fileToBuildMap[filename])
            return;
        const { root, fileNames, config } = await this.getModule(filename);
        if (this.rootToBuildMap[root])
            return;
        await this.reportESBuildErrors(async () => {
            const build = await esbuild.build({
                absWorkingDir: root,
                entryPoints: [...fileNames],
                outdir: this.workDir,
                outbase: this.workspaceRoot,
                incremental: true,
                metafile: true,
                bundle: false,
                platform: "node",
                format: "cjs",
                target: ["node14"],
                sourcemap: "inline",
                ...config.esbuild,
            });
            this.rootToBuildMap[root] = build;
            utils_1.log.debug("started build", {
                root,
                promptedBy: filename,
                files: fileNames.length,
            });
            this.builds.push(build);
            for (const file of fileNames) {
                this.fileToBuildMap[file] = build;
                this.fileToGroupMap[file] = fileNames;
            }
            for (const [output, details] of Object.entries(build.metafile.outputs)) {
                if (details.entryPoint) {
                    this.fileToDestinationMap[path_1.default.join(root, details.entryPoint)] = path_1.default.resolve(output);
                }
            }
            return fileNames;
        });
    }
    async reportESBuildErrors(run) {
        try {
            return await run();
        }
        catch (error) {
            utils_1.log.error(error);
        }
    }
    async destination(filename) {
        const result = this.fileToDestinationMap[filename];
        if (!result) {
            const ignorePattern = await this.isFilenameIgnored(filename);
            if (ignorePattern) {
                throw new Error(`File ${filename} is imported but not being built because it is explicitly ignored in the esbuild-dev project config. It is being ignored by the provided glob pattern '${ignorePattern}', remove this pattern from the project config or don't import this file to fix.`);
            }
            else {
                throw new Error(`Built output for file ${filename} not found. ${this.fileToGroupMap[filename]
                    ? "File is being built but no output was produced."
                    : "File is not being built, is it outside the project directory?"}`);
            }
        }
        return result;
    }
    /** The list of globby patterns to use when searching for files to build */
    fileGlobPatterns(config) {
        const extensions = config.esbuild?.resolveExtensions || DefaultExtensions;
        return [`**/*{${extensions.join(",")}}`];
    }
    /** The list of globby patterns to ignore use when searching for files to build */
    ignoreFileGlobPatterns(config) {
        return [`!node_modules`, `!**/*.d.ts`, ...(config.ignore || []).map((ignore) => `!${ignore}`)];
    }
    /**
     * Detect if a file is being ignored by the ignore glob patterns for a given project
     *
     * Returns false if the file isn't being ignored, or the ignore pattern that is ignoring it if it is.
     */
    async isFilenameIgnored(filename) {
        const root = find_root_1.default(filename);
        const config = await utils_1.projectConfig(root);
        const includeGlobs = this.fileGlobPatterns(config);
        const ignoreGlobs = this.ignoreFileGlobPatterns(config);
        const actual = await globby_1.default([...includeGlobs, ...ignoreGlobs], { cwd: root, absolute: true });
        const all = await globby_1.default(includeGlobs, { cwd: root, absolute: true });
        // if the file isn't returned when we use the ignores, but is when we don't use the ignores, it means were ignoring it. Figure out which ignore is causing this
        if (!actual.includes(filename) && all.includes(filename)) {
            for (const ignoreGlob of ignoreGlobs) {
                const withThisIgnore = await globby_1.default([...includeGlobs, ignoreGlob], { cwd: root, absolute: true });
                if (!withThisIgnore.includes(filename)) {
                    return ignoreGlob;
                }
            }
        }
        return false;
    }
    invalidate(filename) {
        // Invalidating is taken care of by esbuild
        return;
    }
}
exports.EsBuildCompiler = EsBuildCompiler;
//# sourceMappingURL=EsBuildCompiler.js.map