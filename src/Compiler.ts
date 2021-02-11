import { BuildIncremental, Service, startService } from "esbuild";
import findRoot from "find-root";
import globby from "globby";
import path from "path";
import { log, projectConfig, time } from "./utils";

// https://esbuild.github.io/api/#resolve-extensions
const DefaultExtensions = [".tsx", ".ts", ".jsx", ".mjs", ".cjs", ".js"];

/** Implements TypeScript building using esbuild */
export class Compiler {
  service!: Service;

  // a list of incremental esbuilds we're maintaining right now, one for each tsconfig.json / typescript project required by the process
  builds: BuildIncremental[] = [];

  // a map from filename to which build is responsible for it
  fileMap: { [filename: string]: BuildIncremental } = {};

  // a map from a tsconfig file to which build is responsible for it
  rootMap: { [filename: string]: BuildIncremental } = {};

  // a map from filename to which group of files are being built alongside it
  groupMap: { [filename: string]: string[] } = {};

  constructor(readonly workspaceRoot: string, readonly workDir: string) {}

  async boot() {
    this.service = await startService();
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
    this.fileMap = {};
    this.rootMap = {};
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
    const files = this.groupMap[filename];
    if (!files) return {};
    return Object.fromEntries(files.map((file) => [file, this.destination(file)]));
  }

  stop() {
    this.service.stop();
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

    const globs = [`**/*{${extensions.join(",")}}`, `!node_modules`, ...(config.ignore || []).map((ignore) => `!${ignore}`)];
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
    if (this.fileMap[filename]) return;
    const { root, fileNames, config } = await this.getModule(filename);
    if (this.rootMap[root]) return;

    await this.reportESBuildErrors(async () => {
      const build = await this.service.build({
        entryPoints: [...fileNames],
        incremental: true,
        bundle: false,
        platform: "node",
        format: "cjs",
        target: ["node14"],
        outdir: this.workDir,
        outbase: this.workspaceRoot,
        sourcemap: "inline",
        ...(config.esbuild as Record<string, any>),
      });

      this.rootMap[root] = build;

      log.debug("started build", {
        root,
        promptedBy: filename,
        files: fileNames.length,
      });

      this.builds.push(build);

      for (const file of fileNames) {
        this.fileMap[file] = build;
        this.groupMap[file] = fileNames;
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

  private destination = (filename: string) => {
    // make path relative to the workspace root
    let dest = filename.replace(this.workspaceRoot, "");
    // strip the original extension and replace with .js
    const extension = path.extname(dest);
    if (extension != ".js") {
      dest = dest.slice(0, dest.length - extension.length) + ".js";
    }

    return path.join(this.workDir, dest);
  };
}
