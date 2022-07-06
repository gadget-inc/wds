"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const json_1 = require("./json");
const protocol_1 = require("./protocol");
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
    process.stdout.write(`${protocol_1.MARKER}${json_1.json.stringify(metrics)}`);
});
//# sourceMappingURL=bench-child-hooks.js.map