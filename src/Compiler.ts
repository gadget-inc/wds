import type { BuildIncremental } from "esbuild";
import * as esbuild from "esbuild";
import findRoot from "find-root";
import globby from "globby";
import path from "path";
import { ProjectConfig } from "./Options";
import { log, projectConfig, time } from "./utils";
import * as fs from "fs/promises";

// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];

/** Implements TypeScript building using esbuild */
export class Compiler {
  // a map from filename to which build is responsible for it
  fileToBuildMap: { [filename: string]: BuildIncremental } = {};

  // a map from a tsconfig file to which build is responsible for it
  rootToBuildMap: Map<string, BuildIncremental> = new Map();

  // a map from filename to which group of files are being built alongside it
  fileToGroupMap: { [filename: string]: string[] } = {};

  // a map from absolute input filename to absolute output filename
  fileToContentMap: { [filename: string]: string } = {};

  constructor(readonly workspaceRoot: string, readonly workDir: string) {}

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
    await Promise.all(Array.from(this.rootToBuildMap.values()).map((build) => build.rebuild.dispose()));
    this.fileToBuildMap = {};
    this.rootToBuildMap = new Map();
  }

  /**
   * Start compiling a new file at `filename`. Returns the destination that file's compiled output will be found at in the workdir
   **/
  async compile(filename: string) {
    await this.startBuilding(filename);
    return await this.destination(filename);
  }

  /**
   * For a given input filename, return all the destinations of the files compiled alongside it in it's compilation group
   **/
  async fileGroup(filename: string) {
    const files = this.fileToGroupMap[filename];
    const result: Record<string, string> = {};
    if (!files) return result;
    for (const file of files) {
      result[file] = await this.destination(file);
    }
    return result;
  }

  async rebuild() {
    const duration = await time(async () => {
      const promises =
        Array.from(this.rootToBuildMap.entries()).map(async ([root, build]) => {
          await build.rebuild();
          await this.loadFiles(root, build)
        })
      await Promise.all(promises)
    });

    log.debug("rebuild", {
      duration,
    });
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

  /**
   * Begins building a new file by starting up an incremental esbuild build for the whole project that file belongs to.
   * If a file is part of a project we've seen before, it's a no-op.
   **/
  private async startBuilding(filename: string) {
    if (this.fileToBuildMap[filename]) return;
    const { root, fileNames, config } = await this.getModule(filename);
    if (this.rootToBuildMap.get(root)) return;

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
        ...(config.esbuild as Record<string, any>),
      });

      this.rootToBuildMap.set(root, build);

      log.debug("started build", {
        root,
        promptedBy: filename,
        files: fileNames.length,
      });

      for (const file of fileNames) {
        this.fileToBuildMap[file] = build;
        this.fileToGroupMap[file] = fileNames;
      }

      await this.loadFiles(root, build);

      return fileNames;
    });
  }

  private async loadFiles(root: string, build: BuildIncremental) {
    const promises =
      Object
        .entries(build.metafile!.outputs)
        .map(async ([output, details]) => {
          if (details.entryPoint) {
            // TODO: Treating files as UTF-8 is incorrect as JS strings don't have to fit in the UTF-8 space.
            this.fileToContentMap[path.join(root, details.entryPoint)] = await fs.readFile(path.resolve(output), "utf-8");
          }
        })

    return await Promise.all(promises);
  }

  private async reportESBuildErrors<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      log.error(error);
    }
  }

  private async destination(filename: string) {
    const result = this.fileToContentMap[filename];
    if (!result) {
      const ignorePattern = await this.isFilenameIgnored(filename);

      if (ignorePattern) {
        throw new Error(
          `File ${filename} is imported but not being built because it is explicitly ignored in the esbuild-dev project config. It is being ignored by the provided glob pattern '${ignorePattern}', remove this pattern from the project config or don't import this file to fix.`
        );
      } else {
        throw new Error(
          `Built output for file ${filename} not found. ${
            this.fileToGroupMap[filename]
              ? "File is being built but no output was produced."
              : "File is not being built, is it outside the project directory?"
          }`
        );
      }
    }

    return result;
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
}
