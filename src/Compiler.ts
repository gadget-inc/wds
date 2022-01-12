export type Compiler = {
  /**
   * When a file operation occurs that requires setting up all the esbuild builds again, we run this.
   * The operations that should cause an invalidation are:
   *  - a change in the tsconfig.json
   *  - any new file being added
   *  - any existing file being deleted
   *
   * The set of files being built changing causes a reset because esbuild is only incremental over the exact same set of input options passed to it, which includes the files. So we need
   */
  invalidateBuildSet(): Promise<void>;

  /**
   * Compiles a new file at `filename`.
   **/
  compile(filename: string): Promise<void>;

  /**
   * For a given input filename, return all the destinations of the files compiled alongside it in its compilation group.
   **/
  fileGroup(filename: string): Promise<Record<string, string>>;

  /**
   * Invalidates a compiled file, after it changes on disk.
   */
  invalidate(filename: string): void;

  /**
   * Rebuilds invalidated files
   */
  rebuild(): Promise<void>;
};
