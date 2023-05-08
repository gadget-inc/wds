import { MissingDestinationError, SwcCompiler } from '../src/SwcCompiler'
import * as fs from "fs/promises";
import os from "os";
import path from "path";

const compile = async (filename: string, root = "fixtures/src") => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wds-test"));
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
function _child_process() {
    const data = require(\"child_process\");
    _child_process = function() {
        return data;
    };
    return data;
}
`.trim());
});

test("uses the swc config file from wds.js", async () => {
  const contentWithConfigOverride = await compile("./files_with_config/simple.ts");
  expect(contentWithConfigOverride).not.toContain("strict");

  const contentWithoutConfigOverride = await compile("./simple.ts");
  expect(contentWithoutConfigOverride).toContain("strict");
});

test("uses the .swcrc file if wds.js uses 'swc': '.swcrc'", async () => {
  const contentWithRootSwcrc = await compile("./files_with_swcrc/simple.ts");
  expect(contentWithRootSwcrc).not.toContain("strict");

  const contentWithNestedSwcrc = await compile("./files_with_swcrc/nested/simple.ts");
  expect(contentWithNestedSwcrc).toContain("strict");

  const contentWithoutConfigOverride = await compile("./files_with_swcrc/nested/more_nested/simple.ts");
  expect(contentWithoutConfigOverride).toContain("strict");
});
