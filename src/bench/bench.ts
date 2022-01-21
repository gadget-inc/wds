import { spawn } from "child_process";
import path from "path";
import { json } from "./json";
import { ChildProcessResult, MARKER } from "./protocol";

async function spawnOnce(runNum: number): Promise<ChildProcessResult> {
  return await new Promise((resolve, reject) => {
    const childProcess = spawn(
      path.resolve("pkg/esbuild-dev.bin.js"),
      ["-r", path.resolve("pkg/bench/bench-child-hooks.js"), path.resolve("pkg/bench/scripts/noop.js")],
      {
        stdio: ["ignore", "pipe", "inherit"],
      }
    );

    const chunks: Uint8Array[] = [];
    childProcess.stdout.on("data", (data) => chunks.push(data));
    childProcess.stdout.on("end", () => {
      const str = Buffer.concat(chunks).toString("utf-8");
      const line = str.split("\n").find((l) => l.startsWith(MARKER));

      if (!line) {
        return reject("Failed to find metric output line in child process. Did it terminate correctly?");
      }

      const metrics = json.parse(line.replace(MARKER, ""));
      resolve(metrics);
    });
  });
}

export type bootArgs = {
  runs: number;
};

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

export async function boot(args: bootArgs): Promise<void> {
  const results: Array<RunResult> = [];

  process.stdout.write("Starting boot benchmark\n");

  for (let i = 0; i < args.runs; i++) {
    const startTime = process.hrtime.bigint();
    const result = await spawnOnce(i);
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
