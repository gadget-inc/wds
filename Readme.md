# wds

A reloading dev server for server side TypeScript projects. Compiles TypeScript _real_ fast, on demand, using `require.extensions`. Similar to and inspired by `ts-node-dev`.

wds stands for Whirlwind (or web) Development Server.

## Examples

After installing `wds`, you can use it like you might use the `node` command line program:

```shell
# run one script with wds compiling TS to JS
wds some-script.ts

# run one server with wds `watch` mode, re-running the server on any file changes
wds --watch some-server.ts

# run one script with node command line arguments that you'd normally pass to `node`
wds --inspect some-test.test.ts
```

## Features

- Builds and runs TypeScript really fast using [`swc`](https://github.com/swc-project/swc)
- Incrementally rebuilds only what has changed in `--watch` mode, restarting the process on file changes
- Full support for CommonJS and ESM packages (subject to node's own interoperability rules)
- Caches transformed files on disk for warm startups on process reload (with expiry when config or source changes)
- Execute commands on demand with the `--commands` mode
- Plays nice with node.js command line flags like `--inspect` or `--prof`
- Supports node.js `ipc` channels between the process starting `wds` and the node.js process started by `wds`.
- Produces sourcemaps which Just Work™️ by default for debugging with many editors (VSCode, IntelliJ, etc)
- Monorepo aware, allowing for different configuration per package and only compiling what is actually required from the monorepo context

## Motivation

You deserve to get stuff done. You deserve a fast iteration loop. If you're writing TypeScript for node, you still deserve to have a fast iteration loop, but with big codebases, `tsc` can get quite slow. Instead, you can use a fast TS => JS transpiler like `swc` to quickly reload your runtime code and get to the point where you know if your code is working as fast as possible. This means a small sacrifice: `tsc` no longer typechecks your code as you run it, and so you must supplement with typechecking in your editor or in CI.

This tool prioritizes rebooting a node.js TypeScript project as fast as possible. This means it _doesn't_ typecheck. Type checking gets prohibitively slow at scale, so we recommend using this separate typechecker approach that still gives you valuable feedback out of band. That way, you don't have to wait for it to see if your change actually worked. We usually don't run anything other than VSCode's TypeScript integration locally, and then run a full `tsc --noEmit` in CI.

## Usage

```text
Options:
      --help       Show help                                           [boolean]
      --version    Show version number                                 [boolean]
  -c, --commands   Trigger commands by watching for them on stdin. Prevents
                   stdin from being forwarded to the process. Only command right
                   now is `rs` to restart the server. [boolean] [default: false]
  -w, --watch      Trigger restarts by watching for changes to required files
                                                      [boolean] [default: false]
  -s, --supervise  Supervise and restart the process when it exits indefinitely
                                                      [boolean] [default: false]
```

## Configuration

Configuration for `wds` is done by adding a `wds.js` file to your pacakge root, and optionally a `.swcrc` file if using `swc` as your compiler backend.

An `wds.js` file needs to export an object like so:

```javascript
module.exports = {
  // which file extensions to build, defaults to .js, .jsx, .ts, .tsx extensions
  extensions: [".tsx", ".ts", ".mdx"],

  // file paths to explicitly not transform for speed, defaults to [], plus whatever the compiler backend excludes by default, which is `node_modules` for swc
  ignore: ["spec/integration/**/node_modules", "spec/**/*.spec.ts", "cypress/", "public/"],
};
```

### When using `swc` (the default)

`swc` is the fastest TypeScript compiler we've found and is the default compiler `wds` uses. `wds` sets up a default `swc` config suitable for compiling to JS for running in Node:

```jsonc
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "target": "es2020"
  },
  "module": {
    "type": "commonjs",
    // turn on lazy imports for maximum reboot performance
    "lazy": true
  }
}
```

**Note**: the above config is _different_ than the default swc config. It's been honed to give maximum performance for server start time, but can be adjusted by creating your own `.swcrc` file.

Configuring `swc`'s compiler options with with `wds` can be done using the `wds.js` file. Create a file named `wds.js` in the root of your repository with content like this:

```javascript
// wds.js
module.exports = {
  swc: {
    env: {
      targets: {
        node: 12,
      },
    },
  },
};
```

You can also use `swc`'s built in configuration mechanism which is an `.swcrc` file. Using an `.swcrc` file is useful in order to share `swc` configuration between `wds` and other tools that might use `swc` under the hood as well, like `@swc/jest`. To stop using `wds`'s default config and use the config from a `.swcrc` file, you must configure wds to do so using `wds.js` like so:

```javascript
// in wds.js
module.exports = {
  swc: ".swcrc",
};
```

And then, you can use `swc`'s standard syntax for the `.swcrc` file

```jsonc
// in .swcrc, these are the defaults wds uses
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "target": "es2022"
  },
  "module": {
    "type": "commonjs",
    // turn on lazy imports for maximum reboot performance
    "lazy": true
  }
}
```

Refer to [the SWC docs](https://swc.rs/docs/configuration/swcrc) for more info.

# Comparison to `ts-node-dev`

`ts-node-dev` (and `ts-node`) accomplish a similar feat but are often 5-10x slower than `wds` in big projects. They are loaded with features and will keep up with new TypeScript features much better as they use the mainline TypeScript compiler sources, and we think they make lots of sense! Because they use TypeScript proper for compilation though, even with `--transpile-only`, they are destined to be slower than `swc`. `wds` is for the times where you care a lot more about performance and are ok with the tradeoffs `swc` makes, like not supporting `const enum` and being a touch behind on supporting new TypeScript releases.
