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
exports.Compiler = void 0;
const esbuild = __importStar(require("esbuild"));
const find_root_1 = __importDefault(require("find-root"));
const globby_1 = __importDefault(require("globby"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];
/** Implements TypeScript building using esbuild */
class Compiler {
    constructor(workspaceRoot, workDir) {
        this.workspaceRoot = workspaceRoot;
        this.workDir = workDir;
        // a map from a root directory to the build information responsible for it
        this.rootToBuildMap = {};
        // a map from filename to which group of files are being built alongside it
        this.fileToBuildMap = {};
        // a map from absolute input filename to absolute output filename
        this.fileToDestinationMap = {};
    }
    /**
     * Compile a file at `filename` once. Compiles all the files in the project for this filename if it's the first time we're seeing this file.
     *
     * Returns the destination that file's compiled output will be found at in the workdir.
     **/
    async compileOne(filename) {
        const { build, isNew } = await this.getBuild(filename);
        const filenamesToCompile = isNew ? build.files : [filename];
        await this.runBuildGroup(build, filenamesToCompile);
        return this.destination(filename);
    }
    /**
     * Compile all the passed `filenames` once. Returns a map from input to output destination in the workdir for each file.
     **/
    async compileSubset(filenames) {
        const buildSubsets = {};
        await Promise.all(filenames.map(async (filename) => {
            const { build } = await this.getBuild(filename);
            if (!buildSubsets[build.root]) {
                buildSubsets[build.root] = { build, filenames: [] };
            }
            buildSubsets[build.root].filenames.push(filename);
        }));
        await Promise.all(Object.values(buildSubsets).map(async (subset) => {
            await this.runBuildGroup(subset.build, subset.filenames);
        }));
        return this.destinationMap(filenames);
    }
    /**
     * Compile all known `filenames` once.
     **/
    async compileAll() {
        const duration = await utils_1.time(async () => {
            const builds = Object.values(this.rootToBuildMap);
            await Promise.all(builds.map((build) => this.reportESBuildErrors(() => this.runBuildGroup(build, build.files))));
        });
        utils_1.log.debug("rebuild", {
            duration,
        });
    }
    async fileDestinationGroup(filename) {
        const { build } = await this.getBuild(filename);
        return this.destinationMap(build.files);
    }
    async getBuild(filename) {
        if (filename in this.fileToBuildMap) {
            return { build: await this.fileToBuildMap[filename], isNew: false };
        }
        else {
            const promise = (async () => {
                const root = find_root_1.default(filename);
                const config = await utils_1.projectConfig(root);
                const extensions = config.esbuild?.resolveExtensions || DefaultExtensions;
                const globs = [`**/*{${extensions.join(",")}}`, `!node_modules`, ...(config.ignore || []).map((ignore) => `!${ignore}`)];
                utils_1.log.debug("searching for filenames", { config, root, globs });
                let files = await globby_1.default(globs, { cwd: root, absolute: true });
                if (process.platform === "win32") {
                    files = files.map((fileName) => fileName.replace(/\//g, "\\"));
                }
                const build = { root, files, config };
                this.rootToBuildMap[root] = build;
                return build;
            })();
            this.fileToBuildMap[filename] = promise;
            return { build: await promise, isNew: true };
        }
    }
    /**
     * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
     * If a file is part of a project we've seen before, it's a no-op.
     **/
    async runBuildGroup(build, fileNames = build.files) {
        await this.reportESBuildErrors(async () => {
            const output = await esbuild.build({
                absWorkingDir: build.root,
                entryPoints: [...fileNames],
                outdir: this.workDir,
                outbase: this.workspaceRoot,
                metafile: true,
                bundle: false,
                platform: "node",
                format: "cjs",
                target: ["node14"],
                sourcemap: true,
                ...build.config.esbuild,
            });
            utils_1.log.debug("rebuilt", { root: build.root, files: fileNames.length });
            for (const [outputPath, details] of Object.entries(output.metafile.outputs)) {
                if (details.entryPoint) {
                    this.fileToDestinationMap[path_1.default.join(build.root, details.entryPoint)] = path_1.default.resolve(outputPath);
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
    destination(filename) {
        const result = this.fileToDestinationMap[filename];
        if (!result) {
            throw new Error(`Built output for file ${filename} not found`);
        }
        return result;
    }
    destinationMap(filenames) {
        return Object.fromEntries(filenames.map((file) => [file, this.destination(file)]));
    }
}
exports.Compiler = Compiler;
//# sourceMappingURL=Compiler.js.map