/**
 * Entrypoint file passed as --import to all child processes started by wds
 */
import { register } from "node:module";
import { log } from "./utils.cjs";
if (!register) {
    throw new Error(`This version of Node.js (${process.version}) does not support module.register(). Please upgrade to Node v18.19 or v20.6 and above.`);
}
// register the CJS hook to intercept require calls the old way
log.debug("registering wds ESM loader");
// register the ESM loader the new way
register("./child-process-esm-loader.js", import.meta.url);
//# sourceMappingURL=child-process-esm-hook.js.map