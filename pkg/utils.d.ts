export declare const log: {
    debug: (...args: any[]) => void | "" | undefined;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export declare function time<T>(run: () => Promise<T>): Promise<string>;
