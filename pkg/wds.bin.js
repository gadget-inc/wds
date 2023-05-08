#!/usr/bin/env node
"use strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const main = require(".");
main.cli(process.argv).catch(function (error) {
    console.error(`
${error.stack || error.message || error}
`);
    process.exit(1);
});
//# sourceMappingURL=wds.bin.js.map