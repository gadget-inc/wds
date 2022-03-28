"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.benchReload = exports.benchBoot = void 0;
const child_process_1 = require("child_process");
const find_root_1 = __importDefault(require("find-root"));
const fs = __importStar(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("../utils");
const json_1 = require("./json");
const protocol_1 = require("./protocol");
function monitorLogs(childProcess) {
    const childStdOut = childProcess.stdout;
    return new Promise((resolve) => {
        const onEnd = () => {
            childStdOut.removeListener("data", onData);
            childStdOut.removeListener("end", onEnd);
            throw new Error("Failed to find metric output line in child process. Did it terminate correctly?");
        };
        const onData = (data) => {
            const str = data.toString("utf-8");
            const line = str.split("\n").find((l) => l.startsWith(protocol_1.MARKER));
            if (line) {
                const metrics = json_1.json.parse(line.replace(protocol_1.MARKER, ""));
                childStdOut.removeListener("data", onData);
                childStdOut.removeListener("end", onEnd);
                if (metrics.code === 0) {
                    return resolve(metrics);
                }
                else {
                    throw new Error(`Child process completed unsuccessfully, aborting benchmark. Exit code: ${metrics.code}`);
                }
            }
        };
        childStdOut.on("data", onData);
        childStdOut.on("end", onEnd);
    });
}
function spawnOnce(args) {
    const extraArgs = [];
    if (args.supervise) {
        extraArgs.push("--supervise");
        extraArgs.push("--watch");
    }
    if (args.swc) {
        extraArgs.push("--swc");
    }
    const binPath = path_1.default.resolve("pkg/wds.bin.js");
    const root = find_root_1.default(args.filename);
    const relativeFilePath = path_1.default.relative(root, args.filename);
    const allArgs = [...extraArgs, "-r", path_1.default.resolve("pkg/bench/bench-child-hooks.js"), relativeFilePath];
    utils_1.log.debug(binPath, ...allArgs);
    return child_process_1.spawn(binPath, allArgs, {
        stdio: ["ignore", "pipe", "ignore"],
        cwd: root,
    });
}
// https://stackoverflow.com/questions/48719873/how-to-get-median-and-quartiles-percentiles-of-an-array-in-javascript-or-php
const sum = (values) => values.reduce((a, b) => a + b, 0);
const mean = (values) => Number(values.reduce((sum, t) => sum + t, 0)) / values.length;
const stdDev = (values) => {
    if (values.length == 1) {
        return 0;
    }
    const mu = mean(values);
    const diffArr = values.map((a) => (Number(a) - mu) ** 2);
    return Math.sqrt(sum(diffArr) / (values.length - 1));
};
const quantile = (values, q) => {
    const sorted = values.sort();
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    else {
        return sorted[base];
    }
};
function report(results) {
    const asMs = (number) => Math.round((number * 100) / 1e6) / 100;
    const totalDurations = results.map((result) => result.duration);
    const childDurations = results.map((result) => result.metrics.duration);
    return {
        "Total process duration": {
            "mean (ms)": asMs(mean(totalDurations)),
            "stdDev (ms)": asMs(stdDev(totalDurations)),
            "p95 (ms)": asMs(quantile(totalDurations, 0.95)),
        },
        "Child process duration": {
            "mean (ms)": asMs(mean(childDurations)),
            "stdDev (ms)": asMs(stdDev(childDurations)),
            "p95 (ms)": asMs(quantile(childDurations, 0.95)),
        },
    };
}
function execPath(args) {
    let filepath;
    if (args.argv.length === 0) {
        filepath = path_1.default.resolve("src/bench/scripts/noop.ts");
    }
    else {
        filepath = args.argv[0];
    }
    return filepath;
}
async function benchBoot(args) {
    const results = [];
    process.stdout.write(`Starting boot benchmark (pid=${process.pid})\n`);
    for (let i = 0; i < args.runs; i++) {
        const startTime = process.hrtime.bigint();
        const childProcess = spawnOnce({ filename: execPath(args), swc: args.swc });
        const result = await monitorLogs(childProcess);
        const endTime = process.hrtime.bigint();
        results.push({
            startTime,
            endTime,
            duration: Number(endTime - startTime),
            metrics: result,
        });
        process.stdout.write(".");
    }
    process.stdout.write("\n");
    console.table(report(results));
}
exports.benchBoot = benchBoot;
async function benchReload(args) {
    const results = [];
    const filepath = execPath(args);
    const file = await fs.open(filepath, "r+");
    process.stdout.write(`Starting reload benchmark (pid=${process.pid})\n`);
    const childProcess = spawnOnce({ supervise: true, filename: filepath, swc: args.swc });
    const _ignoreInitialBoot = await monitorLogs(childProcess);
    for (let i = 0; i < args.runs; i++) {
        const now = new Date();
        const startTime = process.hrtime.bigint();
        await file.utimes(now, now);
        const [result] = await Promise.all([monitorLogs(childProcess), file.sync()]);
        const endTime = process.hrtime.bigint();
        results.push({
            startTime,
            endTime,
            duration: Number(endTime - startTime),
            metrics: result,
        });
        process.stdout.write(".");
    }
    await file.close();
    childProcess.kill();
    process.stdout.write("\n");
    console.table(report(results));
}
exports.benchReload = benchReload;
//# sourceMappingURL=bench.js.map