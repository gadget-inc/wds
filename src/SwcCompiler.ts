import { transformFile } from "@swc/core";
import findRoot from "find-root";
import * as fs from "fs/promises";
import globby from "globby";
import path from "path";
import { Compiler } from "./Compiler";
import { ProjectConfig } from "./Options";
import { log, projectConfig } from "./utils";

// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];

export type CompiledFile = { filename: string; root: string; destination: string };
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
}

/** Implements TypeScript building using swc */
export class SwcCompiler implements Compiler {
  private compiledFiles: CompiledFiles;
  private invalidatedFiles: Set<string>;
  constructor(readonly workspaceRoot: string, readonly outDir: string) {
    this.compiledFiles = new CompiledFiles();
    this.invalidatedFiles = new Set();
  }

  async invalidateBuildSet() {
    this.compiledFiles = new CompiledFiles();
  }

  async compile(filename: string): Promise<void> {
    const existingGroup = this.compiledFiles.group(filename);

    if (existingGroup) {
      await this.buildFile(filename, existingGroup.root);
    } else {
      await this.buildGroup(filename);
    }

    return;
  }

  async fileGroup(filename: string) {
    const contents: Record<string, string> = {};
    const group = this.compiledFiles.group(filename);

    if (!group) {
      throw new Error(await this.missingDestination(filename));
    }

    for (const file of group.files) {
      contents[file.filename] = file.destination;
    }

    return contents;
  }

  private async getModule(filename: string) {
    const root = findRoot(filename);
    const config = await projectConfig(root);
    const globs = [...this.fileGlobPatterns(config), ...this.ignoreFileGlobPatterns(config)];

    log.debug("searching for filenames", { config, root, globs });

    let fileNames = await globby(globs, { cwd: root, absolute: true });

    if (process.platform === "win32") {
      fileNames = fileNames.map((fileName) => fileName.replace(/\//g, "\\"));
    }

    return { root, fileNames, config };
  }

  private async buildFile(filename: string, root: string): Promise<CompiledFile> {
    const output = await transformFile(filename, {
      cwd: root,
      filename: filename,
      root: this.workspaceRoot,
      rootMode: "root",
      sourceMaps: "inline",
      inlineSourcesContent: true,
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
    });

    const destination = path.join(this.outDir, filename);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, output.code);
    const file = { filename, root, destination };

    this.compiledFiles.addFile(file);

    return file;
  }

  /**
   * Build the group of files at the specified path.
   * If the group has already been built, build only the specified file.
   */
  private async buildGroup(filename: string): Promise<void> {
    // TODO: Use the config
    const { root, fileNames, config } = await this.getModule(filename);

    await this.reportErrors(async () => {
      await Promise.all(fileNames.map((filename) => this.buildFile(filename, root)));
    });

    log.debug("started build", {
      root,
      promptedBy: filename,
      files: fileNames.length,
    });
  }

  private async reportErrors<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      log.error(error);
    }
  }

  private async missingDestination(filename: string) {
    const ignorePattern = await this.isFilenameIgnored(filename);

    // TODO: Understand cases in which the file destination could be missing
    if (ignorePattern) {
      return `File ${filename} is imported but not being built because it is explicitly ignored in the esbuild-dev project config. It is being ignored by the provided glob pattern '${ignorePattern}', remove this pattern from the project config or don't import this file to fix.`;
    } else {
      return `Built output for file ${filename} not found. Is it outside the project directory?`;
    }
  }

  /** The list of globby patterns to use when searching for files to build */
  private fileGlobPatterns(config: ProjectConfig) {
    const extensions = config.esbuild?.resolveExtensions || DefaultExtensions;

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
