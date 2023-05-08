import { json } from "./json";
import type { ChildProcessResult } from "./protocol";
import { MARKER } from "./protocol";

const startTime = process.hrtime.bigint();

process.on("exit", (code) => {
  const endTime = process.hrtime.bigint();

  const metrics: ChildProcessResult = {
    event: "exit",
    startTime,
    endTime,
    code: code,
    duration: Number(endTime - startTime),
  };

  process.stdout.write(`${MARKER}${json.stringify(metrics)}`);
});
