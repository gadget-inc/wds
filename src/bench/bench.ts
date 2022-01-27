import { ChildProcessByStdio, spawn } from "child_process";
import findRoot from "find-root";
import * as fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { log } from "../utils";
import { json } from "./json";
import { ChildProcessResult, MARKER } from "./protocol";

type ChildProcess = ChildProcessByStdio<null, Readable, null>;

function monitorLogs(childProcess: ChildProcess): Promise<ChildProcessResult> {
  const childStdOut = childProcess.stdout;
  return new Promise((resolve) => {
    const onEnd = () => {
      childStdOut.removeListener("data", onData);
      childStdOut.removeListener("end", onEnd);
      throw "Failed to find metric output line in child process. Did it terminate correctly?";
    };
    const onData = (data: Buffer) => {
      const str = data.toString("utf-8");
      const line = str.split("\n").find((l: string) => l.startsWith(MARKER));
      if (line) {
        const metrics = json.parse(line.replace(MARKER, ""));
        childStdOut.removeListener("data", onData);
        childStdOut.removeListener("end", onEnd);
        if (metrics.code === 0) {
          return resolve(metrics);
        } else {
          throw `Child process completed unsuccessfully, aborting benchmark. Exit code: ${metrics.code}`;
        }
      }
    };
    childStdOut.on("data", onData);
    childStdOut.on("end", onEnd);
  });
}

function spawnOnce(args: { supervise?: boolean; filename: string; swc: boolean }): ChildProcess {
  const extraArgs = [];

  if (args.supervise) {
    extraArgs.push("--supervise");
    extraArgs.push("--watch");
  }

  if (args.swc) {
    extraArgs.push("--swc");
  }

  const binPath = path.resolve("pkg/esbuild-dev.bin.js");
  const root = findRoot(args.filename);
  const relativeFilePath = path.relative(root, args.filename);
  const allArgs = [...extraArgs, "-r", path.resolve("pkg/bench/bench-child-hooks.js"), relativeFilePath];

  log.debug(binPath, ...allArgs);

  return spawn(binPath, allArgs, {
    stdio: ["ignore", "pipe", "ignore"],
    cwd: root,
  });
}

type RunResult = {
  startTime: bigint;
  endTime: bigint;
  duration: number;
  metrics: ChildProcessResult;
};

// https://stackoverflow.com/questions/48719873/how-to-get-median-and-quartiles-percentiles-of-an-array-in-javascript-or-php
const sum = (values: Array<number>) => values.reduce((a, b) => a + b, 0);
const mean = (values: Array<number>) => Number(values.reduce((sum, t) => sum + t, 0)) / values.length;
const stdDev = (values: Array<number>) => {
  if (values.length == 1) {
    return 0;
  }
  const mu = mean(values);
  const diffArr = values.map((a) => (Number(a) - mu) ** 2);
  return Math.sqrt(sum(diffArr) / (values.length - 1));
};
const quantile = (values: Array<number>, q: number) => {
  const sorted = values.sort();
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
};

function report(results: Array<RunResult>): Record<string, Record<string, number>> {
  const asMs = (number: number): number => Math.round((number * 100) / 1e6) / 100;
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

export type BenchArgs = {
  swc: boolean;
  runs: number;
  argv: Array<string>;
};

function execPath(args: BenchArgs): string {
  let filepath;
  if (args.argv.length === 0) {
    filepath = path.resolve("src/bench/scripts/noop.ts");
  } else {
    filepath = args.argv[0];
  }

  return filepath;
}

export async function benchBoot(args: BenchArgs): Promise<void> {
  const results: Array<RunResult> = [];

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

export async function benchReload(args: BenchArgs): Promise<void> {
  const results: Array<RunResult> = [];
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
