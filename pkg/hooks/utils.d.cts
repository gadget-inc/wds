export declare const log: {
    debug: (...args: any[]) => void | "" | undefined;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export declare const notifyParentProcessOfRequire: (filename: string) => void;
