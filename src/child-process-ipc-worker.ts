/* eslint-disable @typescript-eslint/no-var-requires */
import http from "http";

// async function to ask the leader process to do the compilation and had us back a list of newly compiled source filenames to compiled filenames
const compileInLeaderProcess = async (filename: string): Promise<Record<string, string>> => {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath: process.env["ESBUILD_DEV_SOCKET_PATH"]!, path: "/", method: "POST" }, (resp: any) => {
      let data = "";
      resp.on("data", (chunk: string) => (data += chunk));
      resp.on("end", () => resolve(JSON.parse(data).filenames));
    });

    request.on("error", reject);
    request.write(filename);
    request.end();
  });
};

module.exports = compileInLeaderProcess;
