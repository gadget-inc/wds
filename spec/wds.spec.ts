import assert from "assert";
import type { ChildProcess } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Supervisor } from "../src/Supervisor.js";
import { wds } from "../src/index.js";
const dirname = fileURLToPath(new URL(".", import.meta.url));

describe("wds", () => {
  let cwd: any;
  let supervisorRestart: any;
  let socketPath: string;

  const sendCompileRequest = async (filename: string) => {
    assert(socketPath, "socketPath must be set");
    const result = await new Promise((resolve, reject) => {
      const request = http.request({ socketPath, path: "/compile", method: "POST", timeout: 200 }, (resp) => {
        let data = "";
        if (resp.statusCode !== 200) {
          return reject(`Error compiling`);
        }
        resp.on("data", (chunk: string) => (data += chunk));
        resp.on("end", () => resolve(JSON.parse(data).filenames));
      });

      request.on("error", (error) => {
        reject(error);
      });
      request.write(filename);
      request.end();
    });

    return result;
  };

  beforeEach(() => {
    cwd = vi.spyOn(process, "cwd").mockImplementation(() => {
      return path.resolve(dirname, "fixtures/src/files_with_config");
    });

    supervisorRestart = vi.spyOn(Supervisor.prototype, "restart").mockImplementation(function () {
      const self = this as unknown as Supervisor;
      socketPath = self.socketPath;
      self.process = {
        on: vi.fn(),
      } as unknown as ChildProcess;
      return self.process;
    });
  });

  afterEach(() => {
    cwd.mockRestore();
    supervisorRestart.mockRestore();
  });

  test("server responds to ignored files", async () => {
    const server = await wds({
      argv: [],
      terminalCommands: false,
      reloadOnChanges: false,
    });
    const result = (await sendCompileRequest(path.resolve(dirname, "fixtures/src/files_with_config/ignored.ts"))) as Record<
      string,
      string | { ignored: boolean }
    >;
    const compiledKeys = Object.keys(result).filter((k) => /spec\/fixtures\/src\/files_with_config\/ignored\.ts/.test(k));
    expect(compiledKeys).toHaveLength(1);
    expect(result[compiledKeys[0]]).toEqual({
      ignored: true,
    });

    server.close();
  });

  test("server responds to included files", async () => {
    const server = await wds({
      argv: [],
      terminalCommands: false,
      reloadOnChanges: false,
    });
    const result = (await sendCompileRequest(path.resolve(dirname, "fixtures/src/files_with_config/simple.ts"))) as Record<
      string,
      string | { ignored: boolean }
    >;
    const compiledKeys = Object.keys(result).filter((k) => /spec\/fixtures\/src\/files_with_config\/simple\.ts/.test(k));
    expect(compiledKeys).toHaveLength(1);
    expect(typeof result[compiledKeys[0]]).toBe("string");

    server.close();
  });
});
