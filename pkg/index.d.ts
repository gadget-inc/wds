import { type RunOptions } from "./ProjectConfig.js";
import { MiniServer } from "./mini-server.js";
export declare const cli: () => Promise<MiniServer>;
export declare const wds: (options: RunOptions) => Promise<MiniServer>;
