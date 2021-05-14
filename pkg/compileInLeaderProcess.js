/* eslint-disable @typescript-eslint/no-var-requires */
import * as http from "http";
import { log } from "./utils";
// async function to ask the leader process to do the compilation and hand us back a list of newly compiled source filenames to compiled filenames
export const compileInLeaderProcess = async (filename) => {
    return await new Promise((resolve, reject) => {
        const request = http.request({ socketPath: process.env["ESBUILD_DEV_SOCKET_PATH"], path: "/compile", method: "POST", timeout: 200 }, (resp) => {
            let data = "";
            if (resp.statusCode !== 200) {
                return reject(`Error compiling ${filename}, parent process responded with status ${resp.statusCode}`);
            }
            resp.on("data", (chunk) => (data += chunk));
            resp.on("end", () => resolve(JSON.parse(data).filenames));
        });
        request.on("error", (error) => {
            log.debug(`Error compiling file ${filename}:`, error);
            reject(error);
        });
        request.write(filename);
        request.end();
    });
};
//# sourceMappingURL=compileInLeaderProcess.js.map