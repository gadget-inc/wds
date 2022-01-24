import { json } from "./json";
import { ChildProcessResult, MARKER } from "./protocol";

const startTime = process.hrtime.bigint();

process.on("exit", () => {
  const endTime = process.hrtime.bigint();

  const metrics: ChildProcessResult = {
    event: "exit",
    startTime,
    endTime,
    duration: Number(endTime - startTime),
  };

  process.stdout.write(`${MARKER}${json.stringify(metrics)}`);
});
