import { Config, Options, transformFile } from "@swc/core";
import findRoot from "find-root";
import * as fs from "fs/promises";
import globby from "globby";
import path from "path";
import { Compiler, PathsMap } from "./Compiler";
import { ProjectConfig } from "./Options";
import { log, projectConfig } from "./utils";

// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];
const SWC_DEFAULTS: Config = {
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

export type CompilationTarget = { filename: string; root: string; destination: Promise<string | CompilationError>; config: Config };
export type Group = { root: string; files: Array<CompilationTarget> };
export class CompilationError extends Error {
  constructor(readonly filename: string, readonly originalError: Error) {
    super(originalError.message);
  }
}

type FileGroup = Map<string, CompilationTarget>;
class CompiledFiles {
  private groups: Map<string, FileGroup>;

  constructor() {
    this.groups = new Map();
  }

  addFile(file: CompilationTarget) {
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

  existingFile(filename: string): CompilationTarget | undefined {
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
  constructor(readonly workspaceRoot: string, readonly outDir: string) {
    this.compiledFiles = new CompiledFiles();
  }

  async invalidateBuildSet() {
    this.compiledFiles = new CompiledFiles();
  }

  async compile(filename: string): Promise<PathsMap> {
    const group = this.compiledFiles.group(filename);

    if (group) {
      return await this.mapPaths(filename, group.files);
    }

    const file = await this.buildGroup(filename);
    return await this.mapPaths(filename, [file]);
  }

  invalidate(filename: string): void {
    const existingFile = this.compiledFiles.existingFile(filename);

    if (existingFile) {
      void this.buildFile(existingFile.filename, existingFile.root, existingFile.config);
    }
  }

  private async mapPaths(requestedFile: string, compilationTargets: Array<CompilationTarget>): Promise<PathsMap> {
    const results: PathsMap = {};
    for (const target of compilationTargets) {
      const result = await target.destination;
      if (result instanceof CompilationError) {
        if (target.filename === requestedFile) {
          throw result;
        } else {
          log.error(result);
          continue;
        }
      }
      results[target.filename] = result;
    }
    return results;
  }

  private async getModule(filename: string) {
    const root = findRoot(filename);
    const config = await projectConfig(root);

    let swcConfig: Options;

    if (config.swc === ".swcrc") {
      swcConfig = { swcrc: true };
    } else if (config.swc === undefined) {
      swcConfig = SWC_DEFAULTS;
    } else {
      swcConfig = config.swc;
    }

    const globs = [...this.fileGlobPatterns(config), ...this.ignoreFileGlobPatterns(config)];

    log.debug("searching for filenames", { config, root, globs });

    let fileNames = await globby(globs, { cwd: root, absolute: true });

    if (process.platform === "win32") {
      fileNames = fileNames.map((fileName) => fileName.replace(/\//g, "\\"));
    }

    return { root, fileNames, swcConfig };
  }

  private async buildFile(filename: string, root: string, config: Options): Promise<CompilationTarget> {
    const destination = path.join(this.outDir, filename).replace(this.workspaceRoot, "");

    const outputPromise = transformFile(filename, {
      cwd: root,
      filename: filename,
      root: this.workspaceRoot,
      rootMode: "root",
      sourceMaps: "inline",
      swcrc: false,
      inlineSourcesContent: true,
      ...config,
    })
      .then(async (output) => {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, output.code);
        target.destination = Promise.resolve(destination);
        return destination;
      })
      .catch((e) => {
        const error = new CompilationError(filename, e);
        target.destination = Promise.resolve(error);
        return error;
      });

    const target = { filename, root, destination: outputPromise, config };

    this.compiledFiles.addFile(target);

    return target;
  }

  /**
   * Build the group of files at the specified path.
   * Returns the requested file immediately and builds the rest in the background.
   */
  private async buildGroup(filename: string): Promise<CompilationTarget> {
    const { root, fileNames, swcConfig } = await this.getModule(filename);

    const requestedFile = this.buildFile(filename, root, swcConfig);

    const otherFiles = fileNames.filter((name) => name !== filename);

    void this.reportErrors(async () => await Promise.all(otherFiles.map((filename) => this.buildFile(filename, root, swcConfig))));

    log.debug("started build", {
      root,
      promptedBy: filename,
      files: fileNames.length,
    });

    return requestedFile;
  }

  private async reportErrors<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      log.error(error);
    }
  }

  /** The list of globby patterns to use when searching for files to build */
  private fileGlobPatterns(config: ProjectConfig) {
    const extensions = config.extensions || DefaultExtensions;

    return [`**/*{${extensions.join(",")}}`];
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
}
