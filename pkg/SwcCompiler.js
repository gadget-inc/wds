import { transform } from "@swc/core";
import { createRequire } from "node:module";
import xxhash from "xxhash-wasm";
import findRoot from "find-root";
import * as fs from "fs/promises";
import globby from "globby";
import _ from "lodash";
import { hasher } from "node-object-hash";
import path from "path";
import { fileURLToPath } from "url";
import writeFileAtomic from "write-file-atomic";
import { log, projectConfig } from "./utils.js";
const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const getPackageVersion = async (packageDir) => {
    const packageJson = JSON.parse(await fs.readFile(path.join(packageDir, "package.json"), "utf-8"));
    return packageJson.version;
};
export class MissingDestinationError extends Error {
    constructor(error) {
        super(error.message);
        this.ignoredFile = !!error.ignoredFile;
    }
}
const SWC_DEFAULTS = {
    jsc: {
        parser: {
            syntax: "typescript",
            decorators: true,
            dynamicImport: true,
        },
        target: "es2022",
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
export class SwcCompiler {
    static async create(workspaceRoot, outDir) {
        const compiler = new SwcCompiler(workspaceRoot, outDir);
        await compiler.initialize();
        return compiler;
    }
    /** @private */
    constructor(workspaceRoot, outDir) {
        this.workspaceRoot = workspaceRoot;
        this.outDir = outDir;
        this.knownCacheEntries = new Set();
        this.compiledFiles = new CompiledFiles();
        this.invalidatedFiles = new Set();
    }
    async initialize() {
        this.xxhash = await xxhash();
        try {
            const files = await globby(path.join(this.outDir, "*", "*"), { onlyFiles: true });
            for (const file of files) {
                this.knownCacheEntries.add(path.basename(file));
            }
        }
        catch (error) {
            // no complaints if the cache dir doesn't exist yet
        }
        // Get package versions for cache keys
        const [thisPackageVersion, swcCoreVersion] = await Promise.all([
            getPackageVersion(findRoot(__filename)),
            getPackageVersion(findRoot(require.resolve("@swc/core"))),
        ]);
        this.cacheEpoch = `${thisPackageVersion}-${swcCoreVersion}`;
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
        const root = findRoot(path.dirname(filename));
        const config = await projectConfig(root);
        let swcConfig;
        if (!config.swc || config.swc === ".swcrc") {
            swcConfig = { swcrc: true };
        }
        else if (config.swc === undefined) {
            swcConfig = SWC_DEFAULTS;
        }
        else {
            swcConfig = config.swc;
        }
        const globs = [...this.fileGlobPatterns(config), ...this.ignoreFileGlobPatterns(config)];
        log.debug("searching for filenames", { filename, config, root, globs });
        let fileNames = await globby(globs, { cwd: root, absolute: true });
        if (process.platform === "win32") {
            fileNames = fileNames.map((fileName) => fileName.replace(/\//g, "\\"));
        }
        return { root, fileNames, swcConfig };
    }
    async buildFile(filename, root, config) {
        const content = await fs.readFile(filename, "utf8");
        const contentHash = this.xxhash.h32ToString(this.cacheEpoch + "///" + filename + "///" + content);
        const cacheKey = `${path.basename(filename).replace(/[^a-zA-Z0-9]/g, "")}-${contentHash.slice(2)}-${hashConfig(config)}`;
        const destination = path.join(this.outDir, contentHash.slice(0, 2), cacheKey);
        if (this.knownCacheEntries.has(cacheKey)) {
            log.debug("cache hit", { cacheKey, destination });
        }
        else {
            log.debug("cache miss, transformed", { cacheKey, destination });
            const options = {
                cwd: root,
                filename: filename,
                root: this.workspaceRoot,
                rootMode: "root",
                sourceMaps: "inline",
                swcrc: false,
                inlineSourcesContent: true,
                ...config,
            };
            const [transformResult, _] = await Promise.all([
                transform(content, options),
                fs.mkdir(path.dirname(destination), { recursive: true }),
            ]);
            await writeFileAtomic(destination, transformResult.code);
            this.knownCacheEntries.add(cacheKey);
        }
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
        await this.reportErrors(Promise.allSettled(fileNames.map((filename) => this.buildFile(filename, root, swcConfig))));
        log.debug("started build", {
            root,
            promptedBy: filename,
            files: fileNames.length,
            compiler: "swc",
        });
    }
    async reportErrors(results) {
        for (const result of await results) {
            if (result.status === "rejected") {
                log.error(result.reason);
            }
        }
    }
    async missingDestination(filename) {
        const ignorePattern = await this.isFilenameIgnored(filename);
        // TODO: Understand cases in which the file destination could be missing
        if (ignorePattern) {
            return {
                message: `File ${filename} is imported but not being built because it is explicitly ignored in the wds project config. It is being ignored by the provided glob pattern '${ignorePattern}', remove this pattern from the project config or don't import this file to fix.`,
                ignoredFile: true,
            };
        }
        else {
            return {
                message: `Built output for file ${filename} not found. Is it outside the project directory, or has it failed to build?`,
                ignoredFile: false,
            };
        }
    }
    /** The list of globby patterns to use when searching for files to build */
    fileGlobPatterns(config) {
        return [`**/*{${config.extensions.join(",")}}`];
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
        const root = findRoot(filename);
        const config = await projectConfig(root);
        const includeGlobs = this.fileGlobPatterns(config);
        const ignoreGlobs = this.ignoreFileGlobPatterns(config);
        const actual = await globby([...includeGlobs, ...ignoreGlobs], { cwd: root, absolute: true });
        const all = await globby(includeGlobs, { cwd: root, absolute: true });
        // if the file isn't returned when we use the ignores, but is when we don't use the ignores, it means were ignoring it. Figure out which ignore is causing this
        if (!actual.includes(filename) && all.includes(filename)) {
            for (const ignoreGlob of ignoreGlobs) {
                const withThisIgnore = await globby([...includeGlobs, ignoreGlob], { cwd: root, absolute: true });
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
const hashObject = hasher({ sort: true });
const hashConfig = _.memoize((config) => hashObject.hash(config));
//# sourceMappingURL=SwcCompiler.js.map