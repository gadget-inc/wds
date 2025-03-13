import path from "path";
import { Worker } from "worker_threads";

async function runWorkerThread(n: number): Promise<{ input: number; result: number; threadId: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "app-thread.js"));

    worker.on("message", (result) => {
      console.log(`Fibonacci(${result.input}) = ${result.result} (calculated in thread ${result.threadId})`);
      resolve(result);
    });

    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage(n);
  });
}

async function main() {
  console.log("Starting worker thread test...");
  try {
    const result = await runWorkerThread(10);
    if (result.result !== 55) {
      throw new Error("Result is incorrect");
    }
    console.log("IT WORKED");
  } catch (error) {
    console.error("Worker thread test failed:", error);
  }
}

main();
