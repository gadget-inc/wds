import { spawn } from "child_process";
import * as path from "path";

// Spawn a long-lived grandchild that logs when it gets SIGTERM
// Resolve from project root (wds runs child with cwd at project root)
const grandchildPath = path.resolve(process.cwd(), "spec/fixtures/src/grandchild.js");
const grandchild = spawn("node", [grandchildPath], {
  stdio: ["ignore", "inherit", "inherit"],
});

console.log(`parent:ready:${process.pid}`);

const exit = (signal: NodeJS.Signals) => {
  console.log(`parent:exit-${signal}`);

  grandchild.once("exit", () => {
    console.log("parent:grandchild-exit");
    process.exit(0);
  });

  setTimeout(() => {
    console.log("parent:exit-timeout");
    process.exit(0);
  }, 2000);

  grandchild.kill(signal);
}

process.on("SIGTERM", () => exit("SIGTERM"));
process.on("SIGINT", () => exit("SIGINT"));
process.on("SIGQUIT", () => {
  console.log("parent:sigquit");
});

// Keep the process alive indefinitely until signaled
setInterval(() => {}, 1e9);


