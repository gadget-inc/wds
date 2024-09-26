import type { RunOptions } from "./Options";
import { MiniServer } from "./mini-server";
export declare const cli: () => Promise<MiniServer>;
export declare const wds: (options: RunOptions) => Promise<MiniServer>;
