import { json } from "./json";
import { ChildProcessResult, MARKER } from "./protocol";

const startTime = process.hrtime.bigint();

process.on("beforeExit", () => {
  const endTime = process.hrtime.bigint();

  const metrics: ChildProcessResult = {
    event: "beforeExit",
    startTime,
    endTime,
    duration: Number(endTime - startTime),
  };

  process.stdout.write(`${MARKER}${json.stringify(metrics)}`);
});
