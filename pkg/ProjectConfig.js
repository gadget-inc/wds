import fs from "fs-extra";
import _ from "lodash";
import micromatch from "micromatch";
import path from "path";
import { log } from "./utils.js";
export const projectConfig = _.memoize(async (root) => {
    const location = path.join(root, "wds.js");
    const base = {
        root,
        extensions: [".ts", ".tsx", ".jsx"],
        cacheDir: path.join(root, "node_modules/.cache/wds"),
        esm: true,
        /** The list of globby patterns to use when searching for files to build */
        includeGlob: `**/*`,
        /** The list of globby patterns to ignore use when searching for files to build */
        ignore: [],
        /** A micromatch matcher for userland checking if a file is included */
        includedMatcher: () => true,
    };
    let exists = false;
    try {
        await fs.access(location);
        exists = true;
    }
    catch (error) {
        log.debug(`Not loading project config from ${location}`);
    }
    let result;
    if (exists) {
        let required = await import(location);
        if (required.default) {
            required = required.default;
        }
        log.debug(`Loaded project config from ${location}`);
        result = _.defaults(required, base);
    }
    else {
        result = base;
    }
    const projectRootDir = path.dirname(location);
    // absolutize the cacheDir if not already
    if (!result.cacheDir.startsWith("/")) {
        result.cacheDir = path.resolve(projectRootDir, result.cacheDir);
    }
    // build inclusion glob and matcher
    // Convert all ignore patterns to absolute paths
    const absoluteIgnorePatterns = result.ignore.map((pattern) => {
        let absolutePattern;
        // Step 1: Determine the base path (prefix handling)
        if (pattern.startsWith("/")) {
            // Already absolute
            absolutePattern = pattern;
        }
        else if (pattern.startsWith("../") || pattern.startsWith("./")) {
            // Relative to project root
            absolutePattern = path.resolve(projectRootDir, pattern);
        }
        else if (pattern.startsWith("**/")) {
            // Glob pattern that should match anywhere under project root
            absolutePattern = path.join(projectRootDir, pattern);
        }
        else {
            // Relative pattern that should match at any depth under project root
            absolutePattern = path.join(projectRootDir, "**", pattern);
        }
        // Step 2: Determine if we need to add suffix for directory patterns
        // Check the original pattern for these characteristics
        if (pattern.endsWith("/")) {
            // Ends with slash - match everything inside
            // Remove trailing slash if present, then add /**
            absolutePattern = absolutePattern.replace(/\/$/, "") + "/**";
        }
        else if (!path.extname(pattern) && !pattern.includes("*")) {
            // No extension and no wildcards - looks like a directory name
            if (!absolutePattern.endsWith("/**")) {
                absolutePattern = `${absolutePattern}/**`;
            }
        }
        return absolutePattern;
    });
    const defaultIgnores = [
        path.join(projectRootDir, "**/node_modules/**"),
        path.join(projectRootDir, "**/*.d.ts"),
        path.join(projectRootDir, "**/.git/**"),
    ];
    result.ignore = _.uniq([...defaultIgnores, ...absoluteIgnorePatterns]);
    result.includeGlob = `**/*{${result.extensions.join(",")}}`;
    // Build an absolute include pattern that matches files with the right extensions anywhere in the filesystem
    // This allows compilation of files outside the project root (e.g., in monorepo sibling packages)
    const absoluteIncludePattern = `/**/*{${result.extensions.join(",")}}`;
    result.includedMatcher = micromatch.matcher(absoluteIncludePattern, { ignore: result.ignore });
    return result;
});
//# sourceMappingURL=ProjectConfig.js.map