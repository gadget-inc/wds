import {MissingDestinationError, SwcCompiler} from '../src/SwcCompiler'
import * as fs from "fs/promises";
import os from "os";
import path from "path";

const compile = async (filename: string, root = "fixtures/src") => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev-test"));
  const rootDir = path.join(__dirname, root);
  const fullPath = path.join(rootDir, filename);

  const compiler = new SwcCompiler(rootDir, workDir)
  await compiler.compile(fullPath);
  const compiledFilePath = (await compiler.fileGroup(fullPath))[fullPath]!;

  return await fs.readFile(compiledFilePath, "utf-8");
}

test("compiles simple files", async () => {
  const content = await compile("./simple.ts");
  expect(content).toContain('console.log("success")')
});

test("throws if the compilation fails", async () => {
  await expect(compile("./failing/failing.ts", "fixtures/failing")).rejects.toThrow(MissingDestinationError);
})

test("compiles lazy import", async () => {
  const content = await compile("./lazy_import.ts");
  expect(content).toContain(`
function _childProcess() {
    const data = require("child_process");
    _childProcess = function() {
        return data;
    };
    return data;
}
`.trim());
});

test("uses the swc config file from esbuild-dev.js", async () => {
  const contentWithConfigOverride = await compile("./files_with_config/simple.ts");
  expect(contentWithConfigOverride).not.toContain("strict");

  const contentWithoutConfigOverride = await compile("./simple.ts");
  expect(contentWithoutConfigOverride).toContain("strict");
});
