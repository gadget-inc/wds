import { parentPort, threadId } from "worker_threads";

function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

parentPort?.on("message", (message: number) => {
  const result = fibonacci(message);
  parentPort?.postMessage({
    input: message,
    result: result,
    threadId: threadId,
  });
});
