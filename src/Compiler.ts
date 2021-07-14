import type { BuildIncremental } from "esbuild";
import * as esbuild from "esbuild";
import findRoot from "find-root";
import globby from "globby";
import path from "path";
import { log, projectConfig, time } from "./utils";

// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];

/** Implements TypeScript building using esbuild */
export class Compiler {
  // a list of incremental esbuilds we're maintaining right now, one for each tsconfig.json / typescript project required by the process
  builds: BuildIncremental[] = [];

  // a map from filename to which build is responsible for it
  fileToBuildMap: { [filename: string]: BuildIncremental } = {};

  // a map from a tsconfig file to which build is responsible for it
  rootToBuildMap: { [filename: string]: BuildIncremental } = {};

  // a map from filename to which group of files are being built alongside it
  fileToGroupMap: { [filename: string]: string[] } = {};

  // a map from absolute input filename to absolute output filename
  fileToDestinationMap: { [filename: string]: string } = {};

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
    await Promise.all(this.builds.map((build) => build.rebuild.dispose()));
    this.builds = [];
    this.fileToBuildMap = {};
    this.rootToBuildMap = {};
  }

  /**
   * Start compiling a new file at `filename`. Returns the destination that file's compiled output will be found at in the workdir
   **/
  async compile(filename: string) {
    await this.startBuilding(filename);
    return this.destination(filename);
  }

  /**
   * For a given input filename, return all the destinations of the files compiled alongside it in it's compilation group
   **/
  fileGroup(filename: string) {
    const files = this.fileToGroupMap[filename];
    if (!files) return {};
    return Object.fromEntries(files.map((file) => [file, this.destination(file)]));
  }

  async rebuild() {
    const duration = await time(async () => {
      await Promise.all(this.builds.map((build) => this.reportESBuildErrors(() => build.rebuild())));
    });

    log.debug("rebuild", {
      duration,
    });
  }

  private async getModule(filename: string) {
    const root = findRoot(filename);
    const config = await projectConfig(root);
    const extensions = config.esbuild?.resolveExtensions || DefaultExtensions;

    const globs = [`**/*{${extensions.join(",")}}`, `!node_modules`, `!**/*.d.ts`, ...(config.ignore || []).map((ignore) => `!${ignore}`)];
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
    if (this.rootToBuildMap[root]) return;

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
        sourcemap: true,
        ...(config.esbuild as Record<string, any>),
      });

      this.rootToBuildMap[root] = build;

      log.debug("started build", {
        root,
        promptedBy: filename,
        files: fileNames.length,
      });

      this.builds.push(build);

      for (const file of fileNames) {
        this.fileToBuildMap[file] = build;
        this.fileToGroupMap[file] = fileNames;
      }

      for (const [output, details] of Object.entries(build.metafile!.outputs)) {
        if (details.entryPoint) {
          this.fileToDestinationMap[path.join(root, details.entryPoint)] = path.resolve(output);
        }
      }

      return fileNames;
    });
  }

  private async reportESBuildErrors<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      log.error(error);
    }
  }

  private destination(filename: string) {
    const result = this.fileToDestinationMap[filename];
    if (!result) {
      throw new Error(`Built output for file ${filename} not found`);
    }
    return result;
  }
}
