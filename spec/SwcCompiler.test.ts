import {CompilationError, SwcCompiler} from '../src/SwcCompiler'
import * as fs from "fs/promises";
import os from "os";
import path from "path";
import { test, expect } from "@jest/globals";
import {PathsMap} from "../src/Compiler";

const compiledContents = async (filename: string, root = "fixtures/src") => {
  const rootDir = path.join(__dirname, root);
  const filePath = path.join(rootDir, filename);
  const paths = await compile(filename, root);
  return await fs.readFile(paths[filePath], "utf-8");
}

const compile = async (filename: string, root = "fixtures/src"): Promise<PathsMap> => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev-test"));
  const rootDir = path.join(__dirname, root);
  const filePath = path.join(rootDir, filename);

  const compiler = new SwcCompiler(rootDir, workDir)
  const res =  await compiler.compile(filePath);
  return res
}

test("compiles simple files", async () => {
  const content = await compiledContents("./simple.ts");
  expect(content).toContain('console.log("success")')
});

test("throws if the compilation fails", async () => {
  await expect(compile("./failing.ts", "fixtures/failing")).rejects.toThrow(CompilationError);
})

test("compiles lazy import", async () => {
  const content = await compiledContents("./lazy_import.ts");
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
  const contentWithConfigOverride = await compiledContents("./files_with_config/simple.ts");
  expect(contentWithConfigOverride).not.toContain("strict");

  const contentWithoutConfigOverride = await compiledContents("./simple.ts");
  expect(contentWithoutConfigOverride).toContain("strict");
});

test("uses the .swcrc file if esbuild-dev.js uses 'swc': '.swcrc'", async () => {
  const contentWithRootSwcrc = await compiledContents("./files_with_swcrc/simple.ts");
  expect(contentWithRootSwcrc).not.toContain("strict");

  const contentWithNestedSwcrc = await compiledContents("./files_with_swcrc/nested/simple.ts");
  expect(contentWithNestedSwcrc).toContain("strict");

  const contentWithoutConfigOverride = await compiledContents("./files_with_swcrc/nested/more_nested/simple.ts");
  expect(contentWithoutConfigOverride).toContain("strict");
});

test("compile returns the file immediately if the group is not available", async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev-test"));
  const rootDir = path.join(__dirname, "fixtures/src");
  const compiler = new SwcCompiler(rootDir, workDir)

  const compile = async (filename: string) => {
    const filePath = path.join(rootDir, filename);
    return await compiler.compile(filePath);
  }

  const firstTime = await compile("./simple.ts");
  expect(Object.keys(firstTime)).toHaveLength(1);
  const secondTime = await compile("./simple.ts");
  expect(Object.keys(secondTime)).not.toHaveLength(1);
})

test("compilation targets are cached until invalidated", async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev-test"));
  const rootDir = path.join(__dirname, "fixtures/src");
  const compiler = new SwcCompiler(rootDir, workDir)

  const newFilePath = path.join(rootDir, "new_simple.ts");

  const compile = async (filename: string) => await fs.readFile((await compiler.compile(filename))[filename], "utf-8");

  try {
    // Prime the cache
    await fs.writeFile(newFilePath, "console.log('1')");
    const content = await compile(newFilePath);
    expect(content).toContain("'1'");

    // Change the file without invalidation
    await fs.writeFile(newFilePath, "console.log('2')");
    const recompiled = await compile(newFilePath);
    expect(recompiled).toContain("'1'");
    expect(recompiled).not.toContain("'2'");

    // Invalidate and recompile
    compiler.invalidate(newFilePath);
    const afterInvalidation = await compile(newFilePath);
    expect(afterInvalidation).toContain("'2'");
    expect(afterInvalidation).not.toContain("'1'");
  } finally {
    await fs.rm(newFilePath);
  }
})

test("invalidateBuildSet invalidates all files", async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esbuild-dev-test"));
  const rootDir = path.join(__dirname, "fixtures/src");
  const compiler = new SwcCompiler(rootDir, workDir)

  const newFilePath = path.join(rootDir, "new_simple.ts");

  const compile = async (filename: string) => await fs.readFile((await compiler.compile(filename))[filename], "utf-8");

  try {
    // Prime the cache
    await fs.writeFile(newFilePath, "console.log('1')");
    const content = await compile(newFilePath);
    expect(content).toContain("'1'");

    await fs.writeFile(newFilePath, "console.log('2')");

    // Invalidate and recompile
    await compiler.invalidateBuildSet();
    const afterInvalidation = await compile(newFilePath);
    expect(afterInvalidation).toContain("'2'");
    expect(afterInvalidation).not.toContain("'1'");
  } finally {
    await fs.rm(newFilePath);
  }
})