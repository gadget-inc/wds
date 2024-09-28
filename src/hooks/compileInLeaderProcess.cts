/* eslint-disable @typescript-eslint/no-var-requires */
import http from "http";
import { debugLog } from "../SyncWorker.cjs";

// async function to ask the leader process to do the compilation and hand us back a list of newly compiled source filenames to compiled filenames
export async function compileInLeaderProcess(filename: string): Promise<Record<string, string>> {
  return await new Promise((resolve, reject) => {
    const request = http.request(
      { socketPath: process.env["WDS_SOCKET_PATH"]!, path: "/compile", method: "POST", timeout: 200 },
      (resp) => {
        let data = "";
        if (resp.statusCode !== 200) {
          return reject(`Error compiling ${filename}, parent process responded with status ${resp.statusCode}`);
        }
        resp.on("data", (chunk: string) => (data += chunk));
        resp.on("end", () => resolve(JSON.parse(data).filenames));
      }
    );

    request.on("error", (error) => {
      debugLog?.(`Error compiling file ${filename}:`, error);
      reject(error);
    });
    request.write(filename);
    request.end();
  });
}

export default compileInLeaderProcess;
