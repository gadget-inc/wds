export type BenchArgs = {
    runs: number;
    argv: Array<string>;
};
export declare function benchBoot(args: BenchArgs): Promise<void>;
export declare function benchReload(args: BenchArgs): Promise<void>;
