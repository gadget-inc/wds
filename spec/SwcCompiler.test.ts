import * as fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test, vi } from "vitest";
import { MissingDestinationError, SwcCompiler } from "../src/SwcCompiler.js";
import { log } from "../src/utils.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));

const compile = async (filename: string, root = "fixtures/src") => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wds-test"));
  const rootDir = path.join(dirname, root);
  const fullPath = path.join(rootDir, filename);

  const compiler = await SwcCompiler.create(rootDir, workDir);
  await compiler.compile(fullPath);
  const compiledFilePath = (await compiler.fileGroup(fullPath))[fullPath]!;

  return await fs.readFile(compiledFilePath, "utf-8");
};

test("compiles simple files", async () => {
  const content = await compile("./simple.ts");
  expect(content).toContain('console.log("success")');
});

test("throws if the compilation fails", async () => {
  await expect(compile("./failing/failing.ts", "fixtures/failing")).rejects.toThrow(MissingDestinationError);
});

test("throws if the file is ignored", async () => {
  let error: MissingDestinationError | null = null;
  try {
    await compile("./files_with_config/ignored.ts");
  } catch (e) {
    if (e instanceof MissingDestinationError) {
      error = e;
    } else {
      throw e;
    }
  }

  expect(error).toBeTruthy();
  expect(error?.ignoredFile).toBeTruthy();
  expect(error?.message).toMatch(
    /File .+ignored\.ts is imported but not being built because it is explicitly ignored in the wds project config\. It is being ignored by the provided glob pattern 'ignored\.ts', remove this pattern from the project config or don't import this file to fix./
  );
});

test("logs error when a file in group fails compilation but continues", async () => {
  const errorLogs: any[] = [];

  const mock = vi.spyOn(log, "error").mockImplementation((...args: any[]) => {
    errorLogs.push(args);
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "wds-test"));
  const rootDir = path.join(dirname, "fixtures/failing");
  const fullPath = path.join(rootDir, "successful.ts");
  const compiler = await SwcCompiler.create(rootDir, workDir);
  await compiler.compile(fullPath);
  const group = await compiler.fileGroup(fullPath);

  expect(group[fullPath]).toBeDefined();
  expect(Object.entries(group).filter(([path]) => /.+(bar|successful)\.ts$/.test(path))).toHaveLength(2);
  const error = errorLogs[0][0];
  expect(error.code).toBe("GenericFailure");
  expect(error.message).toMatch(/.+failing\.ts/);
  expect(error.message).toMatch(/Syntax Error/);

  mock.mockRestore();
});

test("compiles lazy import", async () => {
  const content = await compile("./lazy_import.ts");
  expect(content).toContain(
    `
function _child_process() {
    const data = require("child_process");
    _child_process = function() {
        return data;
    };
    return data;
}
`.trim()
  );
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
