import { ProjectConfig } from "./Options";
export declare const log: {
    debug: (...args: any[]) => void | "" | undefined;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
export declare const time: <T extends unknown>(run: () => Promise<T>) => Promise<string>;
export declare const projectConfig: (root: string) => Promise<ProjectConfig>;
