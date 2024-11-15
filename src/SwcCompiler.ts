import type { Config, Options } from "@swc/core";
import { transform } from "@swc/core";
import { createRequire } from "node:module";
import type { XXHashAPI } from "xxhash-wasm";
import xxhash from "xxhash-wasm";

import findRoot from "find-root";
import * as fs from "fs/promises";
import globby from "globby";
import _ from "lodash";
import { hasher } from "node-object-hash";
import path from "path";
import { fileURLToPath } from "url";
import writeFileAtomic from "write-file-atomic";
import type { Compiler } from "./Compiler.js";
import type { ProjectConfig } from "./Options.js";
import { log, projectConfig } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

const getPackageVersion = async (packageDir: string) => {
  const packageJson = JSON.parse(await fs.readFile(path.join(packageDir, "package.json"), "utf-8"));
  return packageJson.version;
};

export class MissingDestinationError extends Error {
  ignoredFile: boolean;

  constructor(error: { message: string; ignoredFile?: boolean }) {
    super(error.message);
    this.ignoredFile = !!error.ignoredFile;
  }
}

const SWC_DEFAULTS: Config = {
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

export type CompiledFile = { filename: string; root: string; destination: string; config: Config };
export type Group = { root: string; files: Array<CompiledFile> };

type FileGroup = Map<string, CompiledFile>;
class CompiledFiles {
  private groups: Map<string, FileGroup>;

  constructor() {
    this.groups = new Map();
  }

  removeFile(filename: string) {
    for (const [root, files] of this.groups.entries()) {
      if (files.get(filename)) {
        files.delete(filename);
      }
    }
  }

  addFile(file: CompiledFile) {
    let group = this.groups.get(file.root);
    if (!group) {
      group = new Map();
      this.groups.set(file.root, group);
    }
    group.set(file.filename, file);
  }

  group(filename: string): Group | undefined {
    for (const [root, files] of this.groups.entries()) {
      if (files.get(filename)) {
        return { root, files: Array.from(files.values()) };
      }
    }
  }

  existingFile(filename: string): CompiledFile | undefined {
    for (const [_root, files] of this.groups.entries()) {
      const file = files.get(filename);
      if (file) {
        return file;
      }
    }
  }
}

/** Implements TypeScript building using swc */
export class SwcCompiler implements Compiler {
  private compiledFiles: CompiledFiles;
  private invalidatedFiles: Set<string>;
  private knownCacheEntries = new Set<string>();

  static async create(workspaceRoot: string, outDir: string) {
    const compiler = new SwcCompiler(workspaceRoot, outDir);
    await compiler.initialize();
    return compiler;
  }

  /** @private */
  constructor(readonly workspaceRoot: string, readonly outDir: string) {
    this.compiledFiles = new CompiledFiles();
    this.invalidatedFiles = new Set();
  }

  private xxhash!: XXHashAPI;
  private cacheEpoch!: string;

  async initialize() {
    this.xxhash = await xxhash();
    try {
      const files = await globby(path.join(this.outDir, "*", "*"), { onlyFiles: true });
      for (const file of files) {
        this.knownCacheEntries.add(path.basename(file));
      }
    } catch (error) {
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

  async compile(filename: string): Promise<void> {
    const existingFile = this.compiledFiles.existingFile(filename);

    if (existingFile) {
      await this.buildFile(filename, existingFile.root, existingFile.config);
    } else {
      await this.buildGroup(filename);
    }

    return;
  }

  async fileGroup(filename: string) {
    const contents: Record<string, string> = {};
    const group = this.compiledFiles.group(filename);

    if (!group) {
      throw new MissingDestinationError(await this.missingDestination(filename));
    }

    for (const file of group.files) {
      contents[file.filename] = file.destination;
    }

    return contents;
  }

  private async getModule(filename: string) {
    const root = findRoot(path.dirname(filename));
    const config = await projectConfig(root);

    let swcConfig: Options;

    if (!config.swc || typeof config.swc === "string") {
      swcConfig = {
        swcrc: true,
        configFile: config.swc && config.swc !== ".swcrc" ? path.resolve(root, config.swc) : undefined,
      };
    } else if (config.swc === undefined) {
      swcConfig = SWC_DEFAULTS;
    } else {
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

  private async buildFile(filename: string, root: string, config: Config): Promise<CompiledFile> {
    const content = await fs.readFile(filename, "utf8");

    const contentHash = this.xxhash.h32ToString(this.cacheEpoch + "///" + filename + "///" + content);
    const cacheKey = `${path.basename(filename).replace(/[^a-zA-Z0-9]/g, "")}-${contentHash.slice(2)}-${hashConfig(config)}`;
    const destination = path.join(this.outDir, contentHash.slice(0, 2), cacheKey);

    if (!this.knownCacheEntries.has(cacheKey)) {
      const options: Options = {
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
  private async buildGroup(filename: string): Promise<void> {
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

  private async reportErrors<T>(results: Promise<PromiseSettledResult<T>[]>) {
    for (const result of await results) {
      if (result.status === "rejected") {
        log.error(result.reason);
      }
    }
  }

  private async missingDestination(filename: string) {
    const ignorePattern = await this.isFilenameIgnored(filename);

    // TODO: Understand cases in which the file destination could be missing
    if (ignorePattern) {
      return {
        message: `File ${filename} is imported but not being built because it is explicitly ignored in the wds project config. It is being ignored by the provided glob pattern '${ignorePattern}', remove this pattern from the project config or don't import this file to fix.`,
        ignoredFile: true,
      };
    } else {
      return {
        message: `Built output for file ${filename} not found. Is it outside the project directory, or has it failed to build?`,
        ignoredFile: false,
      };
    }
  }

  /** The list of globby patterns to use when searching for files to build */
  private fileGlobPatterns(config: ProjectConfig) {
    return [`**/*{${config.extensions.join(",")}}`];
  }

  /** The list of globby patterns to ignore use when searching for files to build */
  private ignoreFileGlobPatterns(config: ProjectConfig) {
    return [`!node_modules`, `!**/*.d.ts`, ...(config.ignore || []).map((ignore) => `!${ignore}`)];
  }

  /**
   * Detect if a file is being ignored by the ignore glob patterns for a given project
   *
   * Returns false if the file isn't being ignored, or the ignore pattern that is ignoring it if it is.
   */
  private async isFilenameIgnored(filename: string): Promise<string | false> {
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

  invalidate(filename: string): void {
    this.invalidatedFiles.add(filename);
    this.compiledFiles.removeFile(filename);
  }

  async rebuild(): Promise<void> {
    await Promise.all(
      Array.from(this.invalidatedFiles).map((filename) => {
        return this.compile(filename);
      })
    );
    return;
  }
}

const hashObject = hasher({ sort: true });
const hashConfig = _.memoize((config: Config) => hashObject.hash(config));
