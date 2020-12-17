import { BuildIncremental, Service, startService } from "esbuild";
import path from "path";
import pkgDir from "pkg-dir";
import ts from "typescript";
import { log, time } from "./utils";

/** Implements TypeScript building using esbuild */
export class Compiler {
  service!: Service;

  // a list of incremental esbuilds we're maintaining right now, one for each tsconfig.json / typescript project required by the process
  builds: BuildIncremental[] = [];

  // a map from filename to which build is responsible for it
  fileMap: { [filename: string]: BuildIncremental } = {};

  // a map from a package root to which build is responsible for it
  packageRootMap: { [filename: string]: BuildIncremental } = {};

  constructor(readonly workspaceRoot: string, readonly workDir: string) {}

  async boot() {
    this.service = await startService();
  }

  async getTSConfig(filename: string) {
    const packageRoot = await pkgDir(filename);
    if (!packageRoot)
      throw new Error(`couldnt find package root for ${filename}`);

    const tsConfigFile = ts.findConfigFile(
      packageRoot,
      ts.sys.fileExists,
      "tsconfig.json"
    );

    if (!tsConfigFile)
      throw new Error(`couldnt find tsconfig.json near ${filename}`);

    const configFile = ts.readConfigFile(tsConfigFile, ts.sys.readFile);
    const tsConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      packageRoot
    );

    if (tsConfig.errors && tsConfig.errors.length > 0) {
      throw new Error(
        tsConfig.errors.map((error) => error.messageText).join("\n")
      );
    }

    return {
      packageRoot,
      tsConfigFile,
      tsConfig,
    };
  }

  async rebuildAll() {
    const duration = await time(async () => {
      await Promise.all(this.builds.map((build) => build.rebuild()));
    });

    log.debug("rebuild", {
      duration,
    });
  }

  async startBuilding(filename: string) {
    if (this.fileMap[filename]) return;
    const { packageRoot, tsConfig, tsConfigFile } = await this.getTSConfig(
      filename
    );
    if (this.packageRootMap[packageRoot]) return;

    const build = await this.service.build({
      entryPoints: [...tsConfig.fileNames],
      incremental: true,
      bundle: false,
      platform: "node",
      format: "cjs",
      target: ["node14"],
      outdir: this.workDir,
      outbase: this.workspaceRoot,
      tsconfig: tsConfigFile,
      sourcemap: true,
      metafile: "meta.json",
    });

    this.packageRootMap[packageRoot] = build;

    log.debug("started build", {
      root: tsConfigFile,
      promptedBy: filename,
      files: tsConfig.fileNames.length,
    });

    this.builds.push(build);
    for (const file of tsConfig.fileNames) {
      this.fileMap[file] = build;
    }
  }

  async compile(filename: string) {
    await this.startBuilding(filename);

    return path.join(
      this.workDir,
      filename.replace(this.workspaceRoot, "").replace(/.tsx?$/, ".js")
    );
  }

  stop() {
    this.service.stop();
  }
}
