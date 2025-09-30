import fs from "fs-extra";
import * as path from "path";
import { fileURLToPath } from "url";
import { beforeEach, describe, expect, it } from "vitest";
import { projectConfig } from "../src/ProjectConfig.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));

describe("ProjectConfig", () => {
  beforeEach(() => {
    projectConfig.cache.clear?.();
  });

  describe("default configuration", () => {
    it("should load default config when wds.js does not exist", async () => {
      const nonExistentRoot = path.join(dirname, "fixtures/configs/non-existent");
      await fs.ensureDir(nonExistentRoot);

      const config = await projectConfig(nonExistentRoot);

      expect(config.root).toBe(nonExistentRoot);
      expect(config.extensions).toEqual([".ts", ".tsx", ".jsx"]);
      expect(config.esm).toBe(true);
      expect(config.includeGlob).toBe("**/*{.ts,.tsx,.jsx}");
      // Default ignores should be applied
      expect(config.includedMatcher(path.join(nonExistentRoot, "node_modules/package/index.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(nonExistentRoot, "types.d.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(nonExistentRoot, ".git/config.ts"))).toBe(false);

      await fs.remove(nonExistentRoot);
    });

    it("should set cacheDir relative to root", async () => {
      const nonExistentRoot = path.join(dirname, "fixtures/configs/non-existent2");
      await fs.ensureDir(nonExistentRoot);

      const config = await projectConfig(nonExistentRoot);

      expect(config.cacheDir).toBe(path.join(nonExistentRoot, "node_modules/.cache/wds"));

      await fs.remove(nonExistentRoot);
    });
  });

  describe("config file loading", () => {
    it("should load empty config and merge with defaults", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/empty-config");

      const config = await projectConfig(configRoot);

      expect(config.root).toBe(configRoot);
      expect(config.extensions).toEqual([".ts", ".tsx", ".jsx"]);
      expect(config.esm).toBe(true);
    });

    it("should use config from existing wds.js", async () => {
      const configRoot = path.join(dirname, "fixtures/src/files_with_config");

      const config = await projectConfig(configRoot);

      expect(config.root).toBe(configRoot);
      expect(config.swc).toBeDefined();
      expect((config.swc as any).jsc.target).toBe("es5");
    });

    it("should merge custom extensions with defaults", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/with-extensions");

      const config = await projectConfig(configRoot);

      expect(config.extensions).toEqual([".ts", ".js"]);
      expect(config.includeGlob).toBe("**/*{.ts,.js}");
    });
  });

  describe("file ignores", () => {
    it("should work with both absolute and relative paths", async () => {
      const configRoot = path.join(dirname, "fixtures/src/files_with_config");

      const config = await projectConfig(configRoot);

      // Absolute paths within project
      expect(config.includedMatcher(path.join(configRoot, "simple.ts"))).toBe(true);
      expect(config.includedMatcher(path.join(configRoot, "ignored.ts"))).toBe(false);

      // Absolute paths outside root are allowed (for monorepo/workspace scenarios)
      expect(config.includedMatcher("/some/other/path/file.ts")).toBe(true);
      expect(config.includedMatcher("/some/other/path/file.tsx")).toBe(true);
    });

    it("should match files with configured extensions", async () => {
      const configRoot = path.join(dirname, "fixtures/src/files_with_config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, "simple.ts"))).toBe(true);
      expect(config.includedMatcher(path.join(configRoot, "test.tsx"))).toBe(true);
      expect(config.includedMatcher(path.join(configRoot, "test.jsx"))).toBe(true);
    });

    it("should not match files with wrong extensions", async () => {
      const configRoot = path.join(dirname, "fixtures/src/files_with_config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, "test.js"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "test.py"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "README.md"))).toBe(false);
    });

    it("should not match explicitly ignored files", async () => {
      const configRoot = path.join(dirname, "fixtures/src/files_with_config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, "ignored.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "simple.ts"))).toBe(true);
    });

    it("should not match .d.ts files", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/empty-config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, "types.d.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "src/types.d.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "types.ts"))).toBe(true);
    });

    it("should not match files in node_modules", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/empty-config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, "node_modules/package/index.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "src/node_modules/package/index.ts"))).toBe(false);
    });

    it("should not match the .git directory", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/empty-config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, ".git"))).toBe(false);
    });

    it("should not match files in .git directory", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/empty-config");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, ".git/config.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, ".git/hooks/pre-commit.ts"))).toBe(false);
    });

    it("should match files with glob pattern ignores", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/basic-ignore");

      const config = await projectConfig(configRoot);

      expect(config.includedMatcher(path.join(configRoot, "src/file.ts"))).toBe(true);
      expect(config.includedMatcher(path.join(configRoot, "src/ignored/file.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "file.test.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(configRoot, "src/file.test.ts"))).toBe(false);
    });

    it("should match files outside project root to support monorepo/workspace scenarios", async () => {
      const configRoot = path.join(dirname, "fixtures/configs/empty-config");

      const config = await projectConfig(configRoot);

      // These paths are outside the project root
      const outsideFile1 = path.resolve(configRoot, "../../outside-file.ts");
      const outsideFile2 = path.resolve(configRoot, "../sibling/file.tsx");

      // Make paths relative to config root for micromatch
      const relativeOutside1 = path.relative(configRoot, outsideFile1);
      const relativeOutside2 = path.relative(configRoot, outsideFile2);

      // Files starting with ../ are outside the root
      expect(relativeOutside1.startsWith("..")).toBe(true);
      expect(relativeOutside2.startsWith("..")).toBe(true);

      // The matcher should match files outside the project root (for workspace scenarios)
      expect(config.includedMatcher(outsideFile1)).toBe(true);
      expect(config.includedMatcher(outsideFile2)).toBe(true);
    });

    it("should ignore directories outside project root with ../../ patterns", async () => {
      const tempRoot = path.join(dirname, "fixtures/configs/temp-parent-ignore");
      await fs.ensureDir(tempRoot);

      // Simulate a monorepo structure: /repo-root/packages/api/wds.js with ignore: ["../../tmp"]
      // This should ignore /repo-root/tmp/clickhouse/file.ts
      await fs.writeFile(
        path.join(tempRoot, "wds.js"),
        `module.exports = { 
          extensions: [".ts", ".tsx"], 
          ignore: ["../../tmp", "../../.direnv"] 
        };`
      );

      const config = await projectConfig(tempRoot);

      // Files outside the project root in ../../tmp should be ignored
      const repoRoot = path.dirname(path.dirname(tempRoot)); // Go up two levels
      const tmpDir = path.join(repoRoot, "tmp");
      const direnvDir = path.join(repoRoot, ".direnv");

      expect(config.includedMatcher(path.join(tmpDir, "clickhouse", "file.ts"))).toBe(false);
      expect(config.includedMatcher(path.join(tmpDir, "file.tsx"))).toBe(false);
      expect(config.includedMatcher(path.join(direnvDir, "node", "bin", "node.ts"))).toBe(false);

      // Files inside the project should not be ignored
      expect(config.includedMatcher(path.join(tempRoot, "src", "file.ts"))).toBe(true);

      await fs.remove(tempRoot);
    });

    it("should ignore extensionless files and directories in ignored paths", async () => {
      const tempRoot = path.join(dirname, "fixtures/configs/temp-extensionless-ignore");
      await fs.ensureDir(tempRoot);

      // Regression test: extensionless files were not being ignored properly
      // Some tools create extensionless data files (databases, caches, etc.)
      await fs.writeFile(
        path.join(tempRoot, "wds.js"),
        `module.exports = { 
          extensions: [".ts", ".tsx", ".mdx"], 
          ignore: ["../../tmp", "../../.direnv"] 
        };`
      );

      const config = await projectConfig(tempRoot);

      // Simulate monorepo structure: /repo-root/packages/api/
      const repoRoot = path.dirname(path.dirname(tempRoot));
      const tmpDir = path.join(repoRoot, "tmp");
      const direnvDir = path.join(repoRoot, ".direnv");

      // Extensionless files deep in ignored directories should be ignored
      const deepExtensionlessFile = path.join(tmpDir, "cache", "data", "store", "abc123", "datafile");
      expect(config.includedMatcher(deepExtensionlessFile)).toBe(false);

      // Extensionless files at any depth in ignored paths should be ignored
      expect(config.includedMatcher(path.join(tmpDir, "some-cache-file"))).toBe(false);
      expect(config.includedMatcher(path.join(direnvDir, "profile"))).toBe(false);

      // Directories in ignored paths should be ignored
      expect(config.includedMatcher(path.join(tmpDir, "cache"))).toBe(false);
      expect(config.includedMatcher(path.join(tmpDir, "cache", "data"))).toBe(false);

      // But extensionless files outside ignored directories should be allowed (for watching purposes)
      expect(config.includedMatcher(path.join(tempRoot, "src", "components"))).toBe(true);

      await fs.remove(tempRoot);
    });

    it("should handle absolute paths in ignore patterns", async () => {
      const tempRoot = path.join(dirname, "fixtures/configs/temp-absolute");
      await fs.ensureDir(tempRoot);
      const absoluteIgnore = "/some/absolute/path/*.ts";
      await fs.writeFile(path.join(tempRoot, "wds.js"), `module.exports = { ignore: ["${absoluteIgnore}"] };`);

      const config = await projectConfig(tempRoot);

      // Absolute path patterns should be preserved and work
      expect(config.includedMatcher("/some/absolute/path/file.ts")).toBe(false);
      expect(config.includedMatcher(path.join(tempRoot, "src/file.ts"))).toBe(true);

      await fs.remove(tempRoot);
    });

    it("should handle complex relative patterns outside root", async () => {
      const tempRoot = path.join(dirname, "fixtures/configs/temp-complex");
      await fs.ensureDir(tempRoot);
      await fs.writeFile(path.join(tempRoot, "wds.js"), `module.exports = { ignore: ["../../../**/*.test.ts", "../../sibling/**"] };`);

      const config = await projectConfig(tempRoot);

      // Test that files matching these patterns are excluded
      const outsideTestFile = path.resolve(tempRoot, "../../../some/file.test.ts");
      const siblingFile = path.resolve(tempRoot, "../../sibling/file.ts");

      expect(config.includedMatcher(outsideTestFile)).toBe(false);
      expect(config.includedMatcher(siblingFile)).toBe(false);
      expect(config.includedMatcher(path.join(tempRoot, "src/file.ts"))).toBe(true);

      await fs.remove(tempRoot);
    });
  });

  describe("cacheDir resolution", () => {
    it("should resolve relative cacheDirs to absolute paths", async () => {
      const tempRoot = path.join(dirname, "fixtures/configs/temp-cache");
      await fs.ensureDir(tempRoot);
      await fs.writeFile(path.join(tempRoot, "wds.js"), "module.exports = { cacheDir: '.cache/wds' };");

      const config = await projectConfig(tempRoot);

      expect(config.cacheDir).toBe(path.join(tempRoot, ".cache/wds"));
      expect(path.isAbsolute(config.cacheDir)).toBe(true);

      await fs.remove(tempRoot);
    });

    it("should keep absolute cacheDirs as-is", async () => {
      const tempRoot = path.join(dirname, "fixtures/configs/temp-cache-abs");
      const absoluteCacheDir = "/tmp/wds-cache";
      await fs.ensureDir(tempRoot);
      await fs.writeFile(path.join(tempRoot, "wds.js"), `module.exports = { cacheDir: "${absoluteCacheDir}" };`);

      const config = await projectConfig(tempRoot);

      expect(config.cacheDir).toBe(absoluteCacheDir);

      await fs.remove(tempRoot);
    });
  });

  it("should handle config with default export", async () => {
    const tempRoot = path.join(dirname, "fixtures/configs/temp-default");
    await fs.ensureDir(tempRoot);
    await fs.writeFile(path.join(tempRoot, "wds.js"), "module.exports.default = { extensions: ['.ts'] };");

    const config = await projectConfig(tempRoot);

    expect(config.extensions).toEqual([".ts"]);

    await fs.remove(tempRoot);
  });

  it("should handle config with esm: false", async () => {
    const tempRoot = path.join(dirname, "fixtures/configs/temp-cjs");
    await fs.ensureDir(tempRoot);
    await fs.writeFile(path.join(tempRoot, "wds.js"), "module.exports = { esm: false };");

    const config = await projectConfig(tempRoot);

    expect(config.esm).toBe(false);

    await fs.remove(tempRoot);
  });

  it("should generate correct includeGlob based on extensions", async () => {
    const tempRoot = path.join(dirname, "fixtures/configs/temp-glob");
    await fs.ensureDir(tempRoot);
    await fs.writeFile(path.join(tempRoot, "wds.js"), "module.exports = { extensions: ['.ts', '.js', '.mjs'] };");

    const config = await projectConfig(tempRoot);

    expect(config.includeGlob).toBe("**/*{.ts,.js,.mjs}");

    await fs.remove(tempRoot);
  });
});
