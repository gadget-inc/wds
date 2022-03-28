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
exports.SwcCompiler = exports.MissingDestinationError = void 0;
const core_1 = require("@swc/core");
const find_root_1 = __importDefault(require("find-root"));
const fs = __importStar(require("fs/promises"));
const globby_1 = __importDefault(require("globby"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];
class MissingDestinationError extends Error {
}
exports.MissingDestinationError = MissingDestinationError;
const SWC_DEFAULTS = {
    env: {
        targets: {
            node: 16,
        },
    },
    jsc: {
        parser: {
            syntax: "typescript",
            decorators: true,
            dynamicImport: true,
        },
        target: "es2020",
    },
    module: {
        type: "commonjs",
        lazy: true,
    },
};
class CompiledFiles {
    constructor() {
        this.groups = new Map();
    }
    removeFile(filename) {
        for (const [root, files] of this.groups.entries()) {
            if (files.get(filename)) {
                files.delete(filename);
            }
        }
    }
    addFile(file) {
        let group = this.groups.get(file.root);
        if (!group) {
            group = new Map();
            this.groups.set(file.root, group);
        }
        group.set(file.filename, file);
    }
    group(filename) {
        for (const [root, files] of this.groups.entries()) {
            if (files.get(filename)) {
                return { root, files: Array.from(files.values()) };
            }
        }
    }
    existingFile(filename) {
        for (const [_root, files] of this.groups.entries()) {
            const file = files.get(filename);
            if (file) {
                return file;
            }
        }
    }
}
/** Implements TypeScript building using swc */
class SwcCompiler {
    constructor(workspaceRoot, outDir) {
        this.workspaceRoot = workspaceRoot;
        this.outDir = outDir;
        this.compiledFiles = new CompiledFiles();
        this.invalidatedFiles = new Set();
    }
    async invalidateBuildSet() {
        this.invalidatedFiles = new Set();
        this.compiledFiles = new CompiledFiles();
    }
    async compile(filename) {
        const existingFile = this.compiledFiles.existingFile(filename);
        if (existingFile) {
            await this.buildFile(filename, existingFile.root, existingFile.config);
        }
        else {
            await this.buildGroup(filename);
        }
        return;
    }
    async fileGroup(filename) {
        const contents = {};
        const group = this.compiledFiles.group(filename);
        if (!group) {
            throw new MissingDestinationError(await this.missingDestination(filename));
        }
        for (const file of group.files) {
            contents[file.filename] = file.destination;
        }
        return contents;
    }
    async getModule(filename) {
        const root = find_root_1.default(filename);
        const config = await utils_1.projectConfig(root);
        let swcConfig;
        if (config.swc === ".swcrc") {
            swcConfig = { swcrc: true };
        }
        else if (config.swc === undefined) {
            swcConfig = SWC_DEFAULTS;
        }
        else {
            swcConfig = config.swc;
        }
        const globs = [...this.fileGlobPatterns(config), ...this.ignoreFileGlobPatterns(config)];
        utils_1.log.debug("searching for filenames", { config, root, globs });
        let fileNames = await globby_1.default(globs, { cwd: root, absolute: true });
        if (process.platform === "win32") {
            fileNames = fileNames.map((fileName) => fileName.replace(/\//g, "\\"));
        }
        return { root, fileNames, swcConfig };
    }
    async buildFile(filename, root, config) {
        const output = await core_1.transformFile(filename, {
            cwd: root,
            filename: filename,
            root: this.workspaceRoot,
            rootMode: "root",
            sourceMaps: "inline",
            swcrc: false,
            inlineSourcesContent: true,
            ...config,
        });
        const destination = path_1.default.join(this.outDir, filename).replace(this.workspaceRoot, "");
        await fs.mkdir(path_1.default.dirname(destination), { recursive: true });
        await fs.writeFile(destination, output.code);
        const file = { filename, root, destination, config };
        this.compiledFiles.addFile(file);
        this.invalidatedFiles.delete(filename);
        return file;
    }
    /**
     * Build the group of files at the specified path.
     * If the group has already been built, build only the specified file.
     */
    async buildGroup(filename) {
        // TODO: Use the config
        const { root, fileNames, swcConfig } = await this.getModule(filename);
        await this.reportErrors(async () => {
            await Promise.all(fileNames.map((filename) => this.buildFile(filename, root, swcConfig)));
        });
        utils_1.log.debug("started build", {
            root,
            promptedBy: filename,
            files: fileNames.length,
        });
    }
    async reportErrors(run) {
        try {
            return await run();
        }
        catch (error) {
            utils_1.log.error(error);
        }
    }
    async missingDestination(filename) {
        const ignorePattern = await this.isFilenameIgnored(filename);
        // TODO: Understand cases in which the file destination could be missing
        if (ignorePattern) {
            return `File ${filename} is imported but not being built because it is explicitly ignored in the wds project config. It is being ignored by the provided glob pattern '${ignorePattern}', remove this pattern from the project config or don't import this file to fix.`;
        }
        else {
            return `Built output for file ${filename} not found. Is it outside the project directory, or has it failed to build?`;
        }
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
        this.invalidatedFiles.add(filename);
        this.compiledFiles.removeFile(filename);
    }
    async rebuild() {
        await Promise.all(Array.from(this.invalidatedFiles).map((filename) => {
            return this.compile(filename);
        }));
        return;
    }
}
exports.SwcCompiler = SwcCompiler;
//# sourceMappingURL=SwcCompiler.js.map