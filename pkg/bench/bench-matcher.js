#!/usr/bin/env node --enable-source-maps
import findRoot from "find-root";
import path from "path";
import { projectConfig } from "../ProjectConfig.js";
// Simple statistics functions
const sum = (values) => values.reduce((a, b) => a + b, 0);
const mean = (values) => sum(values) / values.length;
const stdDev = (values) => {
    if (values.length === 1)
        return 0;
    const mu = mean(values);
    const diffArr = values.map((a) => (a - mu) ** 2);
    return Math.sqrt(sum(diffArr) / (values.length - 1));
};
const quantile = (values, q) => {
    const sorted = [...values].sort((a, b) => a - b);
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
export async function benchMatcher(runs = 10) {
    // Use the current project root
    const root = findRoot(process.cwd());
    const config = await projectConfig(root);
    console.log(`\n📊 Benchmarking includedMatcher performance`);
    console.log(`   Project root: ${root}`);
    console.log(`   Extensions: ${config.extensions.join(", ")}`);
    console.log(`   Ignore patterns: ${config.ignore.length}\n`);
    // Generate test paths that simulate real-world scenarios
    const testPaths = [
        // Files with extensions (should match extension and check ignores)
        path.join(root, "src/index.ts"),
        path.join(root, "src/components/Button.tsx"),
        path.join(root, "src/utils/helper.ts"),
        path.join(root, "src/deep/nested/path/file.ts"),
        path.join(root, "spec/test.spec.ts"),
        path.join(root, "dist/bundle.js"),
        // Files in ignored directories
        path.join(root, "node_modules/package/index.ts"),
        path.join(root, "node_modules/deep/nested/package/index.ts"),
        path.join(root, "src/types.d.ts"),
        path.join(root, ".git/config.ts"),
        // Extensionless files and directories
        path.join(root, "tmp/cache-file"),
        path.join(root, "tmp/data/store/abc123"),
        path.join(root, ".direnv/profile"),
        path.join(root, "src/components"),
        // Files outside project root (monorepo scenario)
        path.resolve(root, "../sibling-package/src/file.ts"),
        path.resolve(root, "../../tmp/cache/data"),
    ];
    const checksPerRun = testPaths.length * 1000;
    const totalChecks = checksPerRun * runs;
    process.stdout.write(`Running ${runs} iterations with ${testPaths.length} test paths (${totalChecks.toLocaleString()} total checks): `);
    const results = [];
    for (let run = 0; run < runs; run++) {
        const startTime = process.hrtime.bigint();
        // Test the matcher with all paths multiple times
        for (let i = 0; i < 1000; i++) {
            for (const testPath of testPaths) {
                config.includedMatcher(testPath);
            }
        }
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime);
        results.push(duration);
        process.stdout.write(".");
    }
    process.stdout.write("\n\n");
    const asMs = (nanoseconds) => Math.round((nanoseconds * 100) / 1e6) / 100;
    const asUs = (nanoseconds) => Math.round(nanoseconds / 1000);
    const avgDuration = mean(results);
    const checksPerSecond = Math.round((checksPerRun / avgDuration) * 1e9);
    console.table({
        "Matcher performance": {
            "checks per run": checksPerRun.toLocaleString(),
            "mean (ms)": asMs(avgDuration),
            "stdDev (ms)": asMs(stdDev(results)),
            "min (ms)": asMs(Math.min(...results)),
            "max (ms)": asMs(Math.max(...results)),
            "p95 (ms)": asMs(quantile(results, 0.95)),
            "checks/sec": checksPerSecond.toLocaleString(),
            "time per check (μs)": asUs(avgDuration / checksPerRun),
        },
    });
    console.log("\n✅ Benchmark complete!\n");
}
// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const runs = process.argv[2] ? parseInt(process.argv[2], 10) : 10;
    benchMatcher(runs).catch((error) => {
        console.error("Benchmark failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=bench-matcher.js.map