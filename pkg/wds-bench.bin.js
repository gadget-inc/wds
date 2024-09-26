#!/usr/bin/env node --enable-source-maps
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cli = void 0;
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const bench_1 = require("./bench/bench");
const cli = async () => {
    const args = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
        .option("runs", {
        type: "number",
        default: 10,
    })
        .option("type", {
        choices: ["boot", "reload"],
        description: `Type of benchmark to run
        Select 'boot' to measure the time taken to run a file from cold boot.
        Select 'reload' to measure how long it takes to reload once a file is modified.
      `,
        default: "",
    }).argv;
    const benchArgs = {
        runs: args.runs,
        argv: args._,
    };
    switch (args.type) {
        case "boot":
            await (0, bench_1.benchBoot)(benchArgs);
            break;
        case "reload":
            await (0, bench_1.benchReload)(benchArgs);
            break;
        default:
            throw new Error(`Unhandled type of benchmark: ${args.type}`);
    }
};
exports.cli = cli;
void (0, exports.cli)();
//# sourceMappingURL=wds-bench.bin.js.map