/**
 * Loader file registered as an ESM module loader
 */
import fs from "fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { ResolverFactory } from "oxc-resolver";
import { debugLog } from "../SyncWorker.cjs";
import { compileInLeaderProcess } from "./compileInLeaderProcess.cjs";
import { notifyParentProcessOfRequire } from "./utils.cjs";
const extensions = process.env["WDS_EXTENSIONS"].split(",");
const wdsProtocol = "file://";
const esmResolver = new ResolverFactory({
    conditionNames: ["import"],
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
export const resolve = function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("node:")) {
        return nextResolve(specifier, context);
    }
    let parentURL;
    if (context.parentURL) {
        if (extname(context.parentURL)) {
            parentURL = dirname(fileURLToPath(context.parentURL));
        }
        else {
            parentURL = fileURLToPath(context.parentURL);
        }
    }
    else {
        parentURL = process.cwd();
    }
    if (specifier.startsWith("file://")) {
        specifier = specifier.slice(7);
    }
    debugLog?.("esm resolver running", { specifier, context, parentURL });
    const resolved = esmResolver.sync(parentURL, specifier);
    debugLog?.("esm resolve result", { specifier, parentURL, resolved });
    if (resolved.error) {
        debugLog?.("esm custom resolver error", { specifier, parentURL, resolved, error: resolved.error });
    }
    if (resolved.error || !resolved.path)
        return nextResolve(specifier, context);
    return {
        format: resolved.moduleType,
        url: "file://" + resolved.path,
        shortCircuit: true,
    };
};
const paths = {};
// Compile a given file by sending it into our async-to-sync wrapper worker js file
// The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
// So, we keep a map of all the files it's compiled so far, and check it first.
const compileOffThread = async (filename) => {
    let result = paths[filename];
    if (!result) {
        const newPaths = await compileInLeaderProcess(filename);
        Object.assign(paths, newPaths);
        result = paths[filename];
    }
    if (!result) {
        throw new Error(`[wds] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`);
    }
    return result;
};
export const load = async function load(url, context, nextLoad) {
    if (!url.startsWith(wdsProtocol)) {
        return await nextLoad(url, context);
    }
    if (!extensions.some((ext) => url.endsWith(ext))) {
        return await nextLoad(url, context);
    }
    const sourceFileName = url.slice(wdsProtocol.length);
    const targetFileName = await compileOffThread(sourceFileName);
    if (typeof targetFileName !== "string") {
        throw new Error(`WDS ESM loader failed because the filename ${sourceFileName} is ignored but still being required.`);
    }
    notifyParentProcessOfRequire(sourceFileName);
    const [content, format] = await Promise.all([fs.readFile(targetFileName, "utf8"), getPackageType(url)]);
    debugLog?.("esm load success", { url, context, sourceFileName, targetFileName, format });
    return {
        format: format ?? context.format,
        shortCircuit: true,
        source: content,
    };
};
async function getPackageType(url) {
    // `url` is only a file path during the first iteration when passed the resolved url from the load() hook
    // an actual file path from load() will contain a file extension as it's required by the spec
    // this simple truthy check for whether `url` contains a file extension will work for most projects but does not cover some edge-cases (such as extensionless files or a url ending in a trailing space)  extensionless files or a url ending in a trailing space)
    const isFilePath = !!extname(url);
    // If it is a file path, get the directory it's in
    const dir = isFilePath ? dirname(fileURLToPath(url)) : url;
    // Compose a file path to a package.json in the same directory,
    // which may or may not exist
    const packagePath = resolvePath(dir, "package.json");
    debugLog?.("getPackageType", { url, packagePath });
    // Try to read the possibly nonexistent package.json
    const type = await fs
        .readFile(packagePath, { encoding: "utf8" })
        .then((filestring) => JSON.parse(filestring).type)
        .catch((err) => {
        if (err?.code !== "ENOENT")
            console.error(err);
    });
    // If package.json existed and contained a `type` field with a value, voilà
    if (type)
        return type;
    // Otherwise, (if not at the root) continue checking the next directory up
    // If at the root, stop and return false
    if (dir.length > 1)
        return await getPackageType(resolvePath(dir, ".."));
    return undefined;
}
//# sourceMappingURL=child-process-esm-loader.js.map