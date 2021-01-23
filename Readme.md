# esbuild-dev

A reloading dev server for server side TypeScript projects. Compiles TypeScript _real_ fast, on demand, using `require.extensions`, and restarts the server when things change. Similar to, and inspired by `ts-node-dev`.

## Features

- Builds and runs TypeScript really fast (using [`esbuild`](https://github.com/evanw/esbuild))
- Incrementally rebuilds only what has changed in the `--watch` mode, and restarts the process when files change
- Supervises the node.js process with `--supervise` to keep incremental context around on process crash, and can restart on demand in the `--commands` mode
- Plays nice with node.js command line flags like `--inspect` or `--prof`

## Status

Pretty darn new! Patches super welcome.

## Motivation

You deserve to get stuff done. You deserve a fast iteration loop. If you're writing TypeScript for node, you still deserve to have a fast interation loop. [`esbuild`](https://github.com/evanw/esbuild) loves you, and I love you, and we think you deserve it.

This tool prioritizes rebooting a node.js TypeScript project as fast as possible. If you're writing a node server that `require`s a lot of code, or does heavy typechecking, running a TypeScript build every time you want to restart the server is too slow. Running a bunch of tools in a chain like `tsc --watch` and `nodemon` can be slow and suck up attention better spent on your actual work. This tool builds your project and then watches for changes on the filesystem (or terminal commands) to restart the process, and does everything it can to make that reload as fast as possible.

This means it _doesn't_ typecheck. Type checking gets prohibitively slow at scale, so we recommend using a separate typechecker that still gives you the valuable feedback, but out of band so you don't have to wait for it to see if your change actually worked. We usually don't run anything other than VSCode's TypeScript integration locally, and then run a full `tsc --noEmit` in CI.

Because we don't want to typecheck, we can use `esbuild` for it's outrageously fast TypeScript to JavaScript compilation, and it's `incremental` mode for running only the minimal amount of rebuilding necessary each time you change the filesystem. Woop woop!

## Usage

```text
Options:
      --help       Show help                                           [boolean]
      --version    Show version number                                 [boolean]
  -c, --commands   Trigger commands by watching for them on stdin. Prevents
                   stdin from being forwarded to the process. Only command right
                   now is `rs` to restart the server. [boolean] [default: false]
  -w, --watch      Trigger restarts by watching for changes to required files
                                                       [boolean] [default: true]
  -s, --supervise  Supervise and restart the process when it exits indefinitely
                                                      [boolean] [default: false]
```

## Comparison to `ts-node-dev`

`ts-node-dev` (and `ts-node`) accomplish a similar feat but are often 5-10x slower than `esbuild-dev` in big projects. They are loaded with features and will keep up with new TypeScript features much better as they use the mainline TypeScript compiler sources, and we think they make lots of sense! Because they use TypeScript proper for compilation though, even with `--transpile-only`, they are destined to be slower than `esbuild`. `esbuild-dev`is for the times where you care a lot more about performance and are ok with the tradeoffs `esbuild` makes, like not supporting`const enum` and being a touch behind on supporting new TypeScript releases.
