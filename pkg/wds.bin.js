#!/usr/bin/env node
"use strict";
import { cli } from "./index.js";
try {
    await cli(process.argv);
}
catch (error) {
    console.error(`
${error.stack || error.message || error}
`);
    process.exit(1);
}
//# sourceMappingURL=wds.bin.js.map