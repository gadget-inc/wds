import { Service, startService } from "esbuild";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

/** Implements TypeScript building using esbuild */
export class Compiler {
  service!: Service;
  workDir!: string;

  async boot() {
    this.service = await startService();
    this.workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev"));
  }

  /**
   * Compiles one file and returns the path to the compiled source
   */
  async compile(path: string) {
    const result = await this.service.build({
      entryPoints: [path],
      incremental: true,
      bundle: false,
      platform: "node",
      target: ["node14"],
      outdir: this.workDir,
      sourcemap: true,
    });

    return result.outputFiles![0].path;
  }

  stop() {
    this.service.stop();
  }
}
