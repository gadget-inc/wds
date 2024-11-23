/**
 * Loader file registered as an ESM module loader
 */
import fs from "node:fs/promises";
import type { LoadHook, ModuleFormat, ResolveHook } from "node:module";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ResolverFactory } from "oxc-resolver";
import { debugLog } from "../SyncWorker.cjs";
import { compileInLeaderProcess } from "./compileInLeaderProcess.cjs";
import { notifyParentProcessOfRequire } from "./utils.cjs";

const extensions = process.env["WDS_EXTENSIONS"]!.split(",");
const builtin = new Set(builtinModules);

const esmResolver = new ResolverFactory({
  conditionNames: ["node", "import"],
  extensions,
  extensionAlias: {
    ".js": [".js", ".ts"],
    ".cjs": [".cjs", ".cts"],
    ".mjs": [".mjs", ".mts"],
    ".jsx": [".jsx", ".tsx"],
    ".mjsx": [".mjsx", ".mtsx"],
    ".cjsx": [".cjsx", ".ctsx"],
  },
});

// export a custom require hook that resolves .js imports to .ts files
export const resolve: ResolveHook = async function resolve(specifier, context, nextResolve) {
  // import fs from "node:fs"
  if (specifier.startsWith("node:")) {
    return {
      url: specifier,
      format: "builtin",
      shortCircuit: true,
    };
  }

  // import fs from "fs"
  if (builtin.has(specifier)) {
    return {
      url: `node:${specifier}`,
      format: "builtin",
      shortCircuit: true,
    };
  }

  // import from data URLs
  if (specifier.startsWith("data:")) {
    return {
      url: specifier,
      shortCircuit: true,
    };
  }

  // import attributes present which we're just gonna assume import json, don't touch em
  if (context.importAttributes?.type) {
    return {
      ...(await nextResolve(specifier)),
      shortCircuit: true,
    };
  }

  // if there's no parentURL, we're resolving an absolute path or an entrypoint. resolve relative to cwd
  let parentURL: string;
  if (context.parentURL) {
    // strip the filename from the parentURL to get the dir to resolve relative to
    parentURL = join(fileURLToPath(context.parentURL), "..");
  } else {
    parentURL = process.cwd();
  }

  debugLog?.("esm resolver running", { specifier, context, parentURL });

  const resolved = await esmResolver.async(parentURL, specifier.startsWith("file:") ? fileURLToPath(specifier) : specifier);
  debugLog?.("oxc resolver result", { specifier, parentURL, resolved });

  if (resolved.error) {
    debugLog?.("esm custom resolver error", { specifier, parentURL, resolved, error: resolved.error });
    throw new Error(`${resolved.error}: ${specifier} cannot be resolved in ${context.parentURL}`);
  }

  if (resolved.path) {
    // we were able to resolve with our custom resolver
    const targetPath = resolved.path;

    // we resolved to a path that needs compilation, return the specifier with the wds protocol
    if (extensions.some((ext) => targetPath.endsWith(ext))) {
      const url = new URL(join("file://", targetPath));
      url.search = "wds=true";

      return {
        format: resolved.moduleType as any,
        url: url.toString(),
        shortCircuit: true,
      };
    }
  }

  // we weren't able to resolve with our custom resolver, fallback to node's default resolver
  try {
    const res = await nextResolve(specifier);
    debugLog?.("esm: resolved with node fallback resolver", { specifier, url: res.url, format: res.format });
    return {
      ...res,
      shortCircuit: true,
    };
  } catch (resolveError) {
    // fallback to cjs resolver, as the specifier may point to non-esm files that can be required
    // stolen from https://github.com/swc-project/swc-node/blob/6f162b495fb1414c16d3d30b61dcfcce6afbb260/packages/register/esm.mts#L209
    try {
      debugLog?.("oxc and node backup resolve error", { resolveError: (resolveError as Error).message });

      const resolution = pathToFileURL(createRequire(process.cwd()).resolve(specifier)).toString();

      debugLog?.("esm: resolved with commonjs require fallback", { specifier, resolution });

      return {
        format: "commonjs",
        url: resolution,
        shortCircuit: true,
      };
    } catch (error) {
      debugLog?.("esm: commonjs require fallback error", { specifier, error });
      throw resolveError;
    }
  }
};

const paths: Record<
  string,
  | string
  | {
      ignored: boolean;
    }
> = {};

// Compile a given file by sending it to the leader process
// The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
// So, we keep a map of all the files it's compiled so far, and check it first.
const compileOffThread = async (filename: string): Promise<string | { ignored: boolean }> => {
  let result = paths[filename];
  if (!result) {
    const newPaths = await compileInLeaderProcess(filename);
    Object.assign(paths, newPaths);
    result = paths[filename];
  }

  if (!result) {
    throw new Error(
      `[wds] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`
    );
  }

  return result;
};

export const load: LoadHook = async function load(url, context, nextLoad) {
  if (!url.endsWith("wds=true")) {
    return await nextLoad(url, context);
  }
  url = url.slice(0, -9);
  if (!extensions.some((ext) => url.endsWith(ext))) {
    return await nextLoad(url, context);
  }

  const format: ModuleFormat = context.format ?? (await getPackageType(fileURLToPath(url))) ?? "commonjs";
  if (format == "commonjs") {
    // if the package is a commonjs package and we return the source contents explicitly, this loader will process the inner requires, but with a broken/different version of \`require\` internally.
    // if we return a nullish source, node falls back to the old, mainline require chain, which has require.cache set properly and whatnot.
    // see https://nodejs.org/docs/latest-v22.x/api/module.html#loadurl-context-nextload under "Omitting vs providing a source for 'commonjs' has very different effects:"
    debugLog?.("esm loader falling back to node builtin commonjs loader", { url, format });

    return {
      format,
      shortCircuit: true,
    };
  }

  const sourceFileName = url.startsWith("file:") ? fileURLToPath(url) : url;
  const targetFileName = await compileOffThread(sourceFileName);
  if (typeof targetFileName !== "string") {
    throw new Error(`WDS ESM loader failed because the filename ${sourceFileName} is ignored but still being imported.`);
  }

  notifyParentProcessOfRequire(sourceFileName);
  const content = fs.readFile(targetFileName, "utf8");

  debugLog?.("esm load success", { url, context, sourceFileName, targetFileName, format });

  return {
    format: format as any,
    shortCircuit: true,
    source: await content,
  };
};

async function getPackageType(path: string, isFilePath?: boolean): Promise<ModuleFormat | undefined> {
  try {
    isFilePath ??= await fs.readdir(path).then(() => false);
  } catch (err: any) {
    if (err?.code !== "ENOTDIR") {
      throw err;
    }
    isFilePath = true;
  }

  // If it is a file path, get the directory it's in
  const dir = isFilePath ? dirname(path) : path;
  // Compose a file path to a package.json in the same directory,
  // which may or may not exist
  const packagePath = resolvePath(dir, "package.json");
  debugLog?.("getPackageType", { path, packagePath });

  // Try to read the possibly nonexistent package.json
  const type = await fs
    .readFile(packagePath, { encoding: "utf8" })
    .then((filestring) => {
      // As per node's docs, we use the nearest package.json to figure out the package type (see https://nodejs.org/api/packages.html#type)
      // If it lacks a "type" key, we assume "commonjs". If we fail to parse, we also choose to assume "commonjs".
      try {
        return JSON.parse(filestring).type || "commonjs";
      } catch (_err) {
        return "commonjs";
      }
    })
    .catch((err) => {
      if (err?.code !== "ENOENT") console.error(err);
    });
  // If package.json existed, we guarantee a type and return it.
  if (type) return type;
  // Otherwise, (if not at the root) continue checking the next directory up
  // If at the root, stop and return false
  if (dir.length > 1) return await getPackageType(resolvePath(dir, ".."), false);

  return undefined;
}
