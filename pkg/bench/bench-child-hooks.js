import { json } from "./json.js";
import { MARKER } from "./protocol.js";
const startTime = process.hrtime.bigint();
process.on("exit", (code) => {
    const endTime = process.hrtime.bigint();
    const metrics = {
        event: "exit",
        startTime,
        endTime,
        code: code,
        duration: Number(endTime - startTime),
    };
    process.stdout.write(`${MARKER}${json.stringify(metrics)}`);
});
//# sourceMappingURL=bench-child-hooks.js.map