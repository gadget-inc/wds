import { ChildProcess, spawn } from "child_process";
import _ from "lodash";
import * as path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const dirname = fileURLToPath(new URL(".", import.meta.url));

const childExit = (child: ChildProcess) => {
  return new Promise<void>((resolve, reject) => {
    child.on("error", (err: Error) => {
      reject(err);
    });

    child.on("exit", (code: number) => {
      if (code == 0) {
        resolve();
      } else {
        reject(new Error(`Child process exited with code ${code}`));
      }
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

test("it can load a commonjs module inside a directory that contains a dot when in esm mode", async () => {
  const binPath = path.join(dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(dirname, "fixtures/esm/github.com/wds/simple.ts");

  const child = spawn("node", [binPath, scriptPath], {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  await childExit(child);
}, 10000);

const runSignalOrderTest = async (signal: NodeJS.Signals) => {
  const binPath = path.join(dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(dirname, "fixtures/src/signal-order.ts");

  const child = spawn("node", [binPath, scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stdout = "";
  let isReady = false;
  const onData = (data: Buffer) => {
    stdout += data.toString();
    if (!isReady && stdout.includes("parent:ready") && stdout.includes("grandchild:ready")) {
      isReady = true;
    }
  };
  child.stdout?.on("data", onData);

  await new Promise<void>((resolve) => {
    const checkReady = () => (isReady ? resolve() : setTimeout(checkReady, 50));
    checkReady();
  });

  const wdsPid = child.pid;


  child.kill(signal);

  await childExit(child);

  // give any SIGKILLs time to propagate
  await new Promise((resolve) => setTimeout(resolve, 250));

  let parentPid: number | undefined;
  let grandchildPid: number | undefined;
  const lines = stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    if (line.includes("parent:ready")) {
      parentPid = parseInt(line.split(":")[2]);
      return `parent:ready`;
    } else if (line.includes("grandchild:ready")) {
      grandchildPid = parseInt(line.split(":")[2]);
      return `grandchild:ready`;
    }
    return line;
  });

  return { lines, wdsPid, parentPid, grandchildPid };
}

const isPidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") {
      return false;
    }
    throw e;
  }
}

test("it kills the child first, then the process group on stop", async () => {
  const { lines, wdsPid, parentPid, grandchildPid } = await runSignalOrderTest("SIGTERM");
  expect(wdsPid).toBeDefined();
  expect(parentPid).toBeDefined();
  expect(grandchildPid).toBeDefined();
  expect(parentPid).not.toBe(wdsPid);
  expect(grandchildPid).not.toBe(wdsPid);
  expect(parentPid).not.toBe(grandchildPid);

  expect(isPidAlive(wdsPid!)).toBe(false);
  expect(isPidAlive(parentPid!)).toBe(false);
  expect(isPidAlive(grandchildPid!)).toBe(false);

  expect(lines).toMatchInlineSnapshot(`
    [
      "parent:ready",
      "grandchild:ready",
      "parent:exit-SIGTERM",
      "grandchild:sigterm",
      "parent:grandchild-exit",
    ]
  `);
}, 20000);

test("it kills grandchildren if they have not shutdown by the time the parent process exits", async () => {
  const { lines, wdsPid, parentPid, grandchildPid } = await runSignalOrderTest("SIGINT");
  expect(wdsPid).toBeDefined();
  expect(parentPid).toBeDefined();
  expect(grandchildPid).toBeDefined();
  expect(parentPid).not.toBe(wdsPid);
  expect(grandchildPid).not.toBe(wdsPid);
  expect(parentPid).not.toBe(grandchildPid);

  expect(isPidAlive(wdsPid!)).toBe(false);
  expect(isPidAlive(parentPid!)).toBe(false);
  expect(isPidAlive(grandchildPid!)).toBe(false);

  expect(lines).toMatchInlineSnapshot(`
    [
      "parent:ready",
      "grandchild:ready",
      "parent:exit-SIGINT",
      "grandchild:sigint",
      "parent:exit-timeout",
    ]
  `);
}, 20000);

test("it kills the whole process group if the child process doesn't exit before the timeout", async () => {
  const { lines, wdsPid, parentPid, grandchildPid } = await runSignalOrderTest("SIGQUIT");
  expect(wdsPid).toBeDefined();
  expect(parentPid).toBeDefined();
  expect(grandchildPid).toBeDefined();
  expect(parentPid).not.toBe(wdsPid);
  expect(grandchildPid).not.toBe(wdsPid);
  expect(parentPid).not.toBe(grandchildPid);

  expect(isPidAlive(wdsPid!)).toBe(false);
  expect(isPidAlive(parentPid!)).toBe(false);
  expect(isPidAlive(grandchildPid!)).toBe(false);

  expect(lines).toMatchInlineSnapshot(`
    [
      "parent:ready",
      "grandchild:ready",
      "parent:sigquit",
    ]
  `);
}, 20000);