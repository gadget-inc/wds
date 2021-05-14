"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolve = void 0;
const compileInLeaderProcess_1 = require("../compileInLeaderProcess");
const paths = {};
// Compile a given file by asking for it from the leader process
// The leader process returns us a list of all the files it just compiled, so that we don't have to pay the IPC boundary cost for each file after this one
// So, we keep a map of all the files it's compiled so far, and check it first.
const compile = async (filename) => {
    let result = paths[filename];
    if (!result) {
        const newPaths = await compileInLeaderProcess_1.compileInLeaderProcess(filename);
        Object.assign(paths, newPaths);
        result = paths[filename];
    }
    if (!result) {
        throw new Error(`[esbuild-dev] Internal error: compiled ${filename} but did not get it returned from the leader process in the list of compiled files`);
    }
    return result;
};
// https://nodejs.org/api/esm.html#esm_resolve_specifier_context_defaultresolve/
const resolve = (specifier, context, defaultResolve) => {
    console.warn({ specifier });
    // const { parentURL = null } = context;
    // // Normally Node.js would error on specifiers starting with 'https://', so
    // // this hook intercepts them and converts them into absolute URLs to be
    // // passed along to the later hooks below.
    // if (specifier.startsWith("https://")) {
    //   return {
    //     url: specifier,
    //   };
    // } else if (parentURL && parentURL.startsWith("https://")) {
    //   return {
    //     url: new URL(specifier, parentURL).href,
    //   };
    // }
    // Let Node.js handle all other specifiers.
    return defaultResolve(specifier, context, defaultResolve);
};
exports.resolve = resolve;
//# sourceMappingURL=child-process-loader.js.map