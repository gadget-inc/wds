export const MARKER = "[esbuild-dev-bench]:";
export type ChildProcessResult = {
  event: string;
  duration: number;
  startTime: bigint;
  endTime: bigint;
  code: number;
};
