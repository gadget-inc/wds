import { ChildProcess, spawn } from "child_process";
import _ from "lodash";
import * as path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const dirname = fileURLToPath(new URL(".", import.meta.url));

const childExit = (child: ChildProcess) => {
  return new Promise<void>((resolve) => {
    child.on("exit", (code: number) => {
      resolve();
      expect(code).toEqual(0);
    });
  });
};

test("it proxies ipc messages", async () => {
  const binPath = path.join(dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(dirname, "fixtures/src/add.ts");

  const child = spawn("node", [binPath, scriptPath], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: process.env,
  });

  const childHasBooted = new Promise<void>((resolve) => {
    const handler = () => {
      resolve();
      child.off("message", handler);
    };
    child.on("message", handler);
  });
  await childHasBooted;

  const messagesToChild = _.range(0, 3);
  const messagesFromChild: Array<number> = [];

  const promise = new Promise<void>((resolve) => {
    child.on("message", (message: any) => {
      messagesFromChild.push(message);

      if (messagesFromChild.length === messagesToChild.length) {
        resolve();
      }
    });
  });

  for (const number of messagesToChild) {
    child.send(number);
  }

  child.send("exit");

  await promise;

  expect(messagesFromChild).toEqual([1, 2, 3]);
}, 10000);

test("it doesn't setup ipc if it wasn't setup with ipc itself", async () => {
  const binPath = path.join(dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(dirname, "fixtures/src/no-ipc.ts");

  const child = spawn("node", [binPath, scriptPath], {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  await childExit(child);
}, 10000);

test("it inherits stdin if WDS was started without terminal commands", async () => {
  const binPath = path.join(dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(dirname, "fixtures/src/echo.ts");

  const child = spawn("node", [binPath, scriptPath], {
    env: process.env,
  });

  let output = "";

  child.stdin.write("test");
  child.stdin.end();

  child.stdout.on("data", (data) => {
    output += data;
  });

  await childExit(child);
  expect(output).toEqual("test");
}, 10000);

test("it doesn't have any stdin if wds is started with terminal commands", async () => {
  const binPath = path.join(dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(dirname, "fixtures/src/echo.ts");

  const child = spawn("node", [binPath, scriptPath, "--commands"], {
    env: process.env,
  });

  let output = "";

  child.stdin.write("test");
  child.stdin.end();

  child.stdout.on("data", (data) => {
    output += data;
  });

  await childExit(child);

  expect(output).toEqual("");
}, 10000);
