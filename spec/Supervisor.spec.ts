import {spawn} from "child_process";
import * as path from "path";
import {range} from "lodash";

test("it proxies ipc messages", async () => {
  const binPath = path.join(__dirname, "../pkg/wds.bin.js");
  const scriptPath = path.join(__dirname, "fixtures/src/add.ts");

  const child = spawn(
    "node",
    [binPath, scriptPath],
    {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      env: process.env,
    }
  );

  const childHasBooted = new Promise<void>((resolve) => {
    const handler = () => {
      resolve();
      child.off("message", handler)
    };
    child.on("message", handler)
  })
  await childHasBooted;

  const messagesToChild = range(0, 3);
  const messagesFromChild: Array<number> = [];

  const promise = new Promise<void>((resolve) => {
    child.on("message", (message: any) => {
      messagesFromChild.push(message)

      if (messagesFromChild.length === messagesToChild.length) {
        resolve();
      }
    });
  });

  for (let number of messagesToChild) {
    child.send(number);
  }

  child.send("exit");

  await promise;

  expect(messagesFromChild).toEqual([1, 2, 3]);
})