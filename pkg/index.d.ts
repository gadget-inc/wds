import type { RunOptions } from "./Options.js";
import { MiniServer } from "./mini-server.js";
export declare const cli: () => Promise<MiniServer>;
export declare const wds: (options: RunOptions) => Promise<MiniServer>;
