/**
 * Entrypoint file passed as --import to all child processes started by wds
 */
import { register } from "node:module";
if (!register) {
    throw new Error(`This version of Node.js (${process.version}) does not support module.register(). Please upgrade to Node v18.19 or v20.6 and above.`);
}
// enable source maps
process.setSourceMapsEnabled(true);
// register the CJS hook to intercept require calls the old way
import "./child-process-cjs-hook.cjs";
if (process.env.WDS_ESM_ENABLED === "true") {
    // register the ESM loader the new way
    register("./child-process-esm-loader.js", import.meta.url);
}
//# sourceMappingURL=child-process-register.js.map